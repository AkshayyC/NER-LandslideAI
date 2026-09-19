"""Command line entry point: build the grid, inspect it, or serve the app."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import MODEL_ID, __version__, config


def _print(value) -> None:
    print(json.dumps(value, indent=2, default=str))


def cmd_build(args: argparse.Namespace) -> int:
    from .service import build_bundle

    extra = sorted(config.USER_DATA_DIR.glob("*.csv")) if config.USER_DATA_DIR.exists() else []
    print(f"building grid from {len(extra)} imported inventory file(s)...")
    bundle = build_bundle(extra_inventory=extra, use_cache=not args.force)
    meta = bundle.meta
    print(
        f"cells {meta['grid']['cells_in_region']:,} of {meta['grid']['cells_total']:,} "
        f"at {meta['grid']['resolution_deg']} deg  ({meta['build_seconds']}s)"
    )
    print(f"season: {meta['season']['regime']}  (trigger season active: {meta['season']['trigger_season_active']})")
    print(f"evidence records: {meta['evidence']['total_records']}")
    print(f"index rescale: {meta['rescale']}")
    if args.json:
        _print(meta)
    return 0


def cmd_point(args: argparse.Namespace) -> int:
    from .service import get_service

    service = get_service()
    _print(service.point(args.lat, args.lon, scenario=args.scenario))
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    from .service import get_service

    _print(get_service().stats())
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    from .inventory import read_inventory_file

    path = Path(args.path).expanduser().resolve()
    records = read_inventory_file(path)
    config.USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = config.USER_DATA_DIR / path.name
    if target.resolve() != path:
        target.write_bytes(path.read_bytes())
    print(f"imported {len(records):,} records from {path.name}")
    print(f"stored at {target}")
    print("rebuilding grid...")
    from .service import build_bundle

    extra = sorted(config.USER_DATA_DIR.glob("*.csv"))
    bundle = build_bundle(extra_inventory=extra, use_cache=False)
    print(f"evidence now: {bundle.meta['evidence']['total_records']} records")
    return 0


def cmd_dem(args: argparse.Namespace) -> int:
    from . import importers

    if args.clear:
        importers.clear_dem()
        print("DEM registration cleared; the generalised surface will be used")
        return 0
    info = importers.register_dem(args.path)
    print(f"registered DEM: {info['path']}")
    print("run `python -m nerls build --force` to rebuild the terrain layers from it")
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run(
        "nerls.api:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level,
    )
    return 0


def cmd_meta(args: argparse.Namespace) -> int:
    from .service import get_service

    _print(get_service().meta())
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nerls",
        description=f"NER-LandslideAI {__version__} ({MODEL_ID})",
    )
    parser.add_argument("--version", action="version", version=f"{__version__} ({MODEL_ID})")
    sub = parser.add_subparsers(dest="command", required=True)

    p_build = sub.add_parser("build", help="assemble the hazard grid")
    p_build.add_argument("--force", action="store_true", help="ignore the on-disk cache")
    p_build.add_argument("--json", action="store_true", help="print the metadata block")
    p_build.set_defaults(func=cmd_build)

    p_point = sub.add_parser("point", help="analyse a single location")
    p_point.add_argument("lat", type=float)
    p_point.add_argument("lon", type=float)
    p_point.add_argument("--scenario", type=float, default=None, help="rainfall multiplier")
    p_point.set_defaults(func=cmd_point)

    p_stats = sub.add_parser("stats", help="regional summary")
    p_stats.set_defaults(func=cmd_stats)

    p_meta = sub.add_parser("meta", help="model and provenance metadata")
    p_meta.set_defaults(func=cmd_meta)

    p_ingest = sub.add_parser("ingest", help="import a landslide inventory CSV")
    p_ingest.add_argument("path")
    p_ingest.set_defaults(func=cmd_ingest)

    p_dem = sub.add_parser("dem", help="register a GeoTIFF elevation raster")
    p_dem.add_argument("path", nargs="?", default="")
    p_dem.add_argument("--clear", action="store_true")
    p_dem.set_defaults(func=cmd_dem)

    p_serve = sub.add_parser("serve", help="run the API and the built frontend")
    p_serve.add_argument("--host", default="0.0.0.0")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--reload", action="store_true")
    p_serve.add_argument("--log-level", default="info")
    p_serve.set_defaults(func=cmd_serve)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "dem" and not args.path and not args.clear:
        parser.error("`dem` needs a path, or --clear")
    try:
        return int(args.func(args))
    except KeyboardInterrupt:  # pragma: no cover
        return 130


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
