"""
Reading cloud-optimised GeoTIFFs over HTTP, without downloading whole scenes.

A Sentinel-2 tile is ~100 MB per band and covers 110 km. We need ~4 km. Range
requests over /vsicurl/ pull only the tiles that intersect our window, which
turns a multi-gigabyte job into a few megabytes.
"""

import os

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

# Without these GDAL lists whole bucket prefixes on every open, which is slow
# and, on some S3 endpoints, fails outright.
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.tiff")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "5")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")
os.environ.setdefault("VSI_CACHE", "TRUE")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")


def read_window(href: str, bbox_wgs84, out_shape=None):
    """
    Read the part of a COG covering `bbox_wgs84` (west, south, east, north).

    Returns (array, transform, crs, nodata). The array is float32 with nodata
    left as-is — masking is the caller's job, because what counts as invalid
    differs per product.
    """
    # A local path must not be wrapped in /vsicurl/.
    if href.startswith("/vsi") or os.path.exists(href):
        url = href
    else:
        url = f"/vsicurl/{href}"
    with rasterio.open(url) as src:
        left, bottom, right, top = transform_bounds(
            "EPSG:4326", src.crs, *bbox_wgs84, densify_pts=21
        )
        win = from_bounds(left, bottom, right, top, src.transform)
        win = win.round_offsets().round_lengths()
        if win.width < 1 or win.height < 1:
            raise ValueError("requested window does not intersect the scene")

        kwargs = {"window": win, "masked": False}
        if out_shape is not None:
            kwargs["out_shape"] = out_shape
        data = src.read(1, **kwargs)
        transform = src.window_transform(win)
        if out_shape is not None:
            # Rescale the transform to match the resampled grid.
            sx = win.width / data.shape[1]
            sy = win.height / data.shape[0]
            transform = transform * rasterio.Affine.scale(sx, sy)
        return data.astype("float32"), transform, src.crs, src.nodata


def ndvi_from(red_href: str, nir_href: str, scl_href: str, bbox):
    """
    NDVI = (NIR - Red) / (NIR + Red), with Sentinel-2's scene classification
    used to drop cloud, shadow, snow and saturated pixels.

    Sentinel-2 L2A reflectance is scaled by 10000 with a 1000 offset from
    processing baseline 04.00 onward; the offset cancels in the NDVI ratio only
    if applied to both bands, so we apply it to both explicitly.
    """
    red, transform, crs, _ = read_window(red_href, bbox)
    nir, _, _, _ = read_window(nir_href, bbox)

    # SCL is 20 m; resample it up to the 10 m grid of red/nir.
    scl, _, _, _ = read_window(scl_href, bbox, out_shape=red.shape)

    red = np.where(red == 0, np.nan, red)
    nir = np.where(nir == 0, np.nan, nir)

    denom = nir + red
    ndvi = np.where(denom == 0, np.nan, (nir - red) / denom)

    # SCL classes: 0 nodata, 1 saturated, 3 cloud shadow, 8/9 cloud med/high,
    # 10 thin cirrus, 11 snow. Everything else is usable ground.
    bad = np.isin(np.rint(scl), [0, 1, 3, 8, 9, 10, 11])
    ndvi = np.where(bad, np.nan, ndvi)

    return ndvi.astype("float32"), transform, crs


def lst_celsius_from(lwir_href: str, bbox):
    """
    Landsat Collection 2 Level-2 surface temperature.

    ST_B10 is stored as uint16. The documented conversion is
    Kelvin = DN * 0.00341802 + 149.0, then subtract 273.15 for Celsius.
    DN 0 is fill.
    """
    dn, transform, crs, _ = read_window(lwir_href, bbox)
    dn = np.where(dn == 0, np.nan, dn)
    kelvin = dn * 0.00341802 + 149.0
    celsius = kelvin - 273.15
    # Anything outside this range is a processing artefact, not ground truth.
    celsius = np.where((celsius < -10) | (celsius > 75), np.nan, celsius)
    return celsius.astype("float32"), transform, crs
