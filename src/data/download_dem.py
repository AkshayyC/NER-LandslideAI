from pathlib import Path
import requests
import re
import time

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "raw" / "dem"

TILES = """
N22E092 N22E093 N23E091 N23E092 N23E093 N23E094
N24E091 N24E092 N24E093 N24E094
N25E089 N25E090 N25E091 N25E092 N25E093 N25E094
N26E090 N26E091 N26E092 N26E093 N26E094 N26E095
N27E088 N27E091 N27E092 N27E093 N27E094 N27E095 N27E096
N28E094 N28E095 N28E096
""".split()


def find_url(tile):
    """
    Discover the Copernicus GLO-90 COG/GeoTIFF URL from
    the public S3 bucket listing.
    """

    # Copernicus AWS naming convention
    # We query the public bucket listing for the tile.
    prefix = f"Copernicus_DSM_COG_90m_{tile}"

    url = (
        "https://copernicus-dem-90m.s3.amazonaws.com/"
        f"?list-type=2&prefix={prefix}"
    )

    response = requests.get(url, timeout=30)
    response.raise_for_status()

    keys = re.findall(r"<Key>(.*?)</Key>", response.text)

    tif_keys = [
        k for k in keys
        if k.lower().endswith((".tif", ".tiff"))
    ]

    if not tif_keys:
        return None

    return "https://copernicus-dem-90m.s3.amazonaws.com/" + tif_keys[0]


def download(tile):

    destination = OUT_DIR / f"{tile}.tif"

    if destination.exists() and destination.stat().st_size > 10000:
        print(f"[SKIP] {tile} already exists")
        return True

    print(f"[SEARCH] {tile}")

    url = find_url(tile)

    if not url:
        print(f"[NOT FOUND] {tile}")
        return False

    print(f"[DOWNLOAD] {tile}")

    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()

        total = int(response.headers.get("content-length", 0))
        downloaded = 0

        with open(destination, "wb") as f:

            for chunk in response.iter_content(chunk_size=1024 * 1024):

                if not chunk:
                    continue

                f.write(chunk)
                downloaded += len(chunk)

                if total:
                    percent = downloaded * 100 / total
                    print(
                        f"\r    {percent:6.1f}%",
                        end=""
                    )

    print()

    if destination.stat().st_size < 10000:
        destination.unlink(missing_ok=True)
        print(f"[FAILED] {tile}")
        return False

    print(f"[OK] {tile}")
    return True


def main():

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("NER-LandslideAI — COPERNICUS GLO-90 DOWNLOADER")
    print("=" * 60)
    print(f"Tiles requested: {len(TILES)}")
    print(f"Output: {OUT_DIR}")
    print()

    successful = 0
    failed = []

    for i, tile in enumerate(TILES, start=1):

        print(f"\n[{i}/{len(TILES)}] {tile}")

        try:
            if download(tile):
                successful += 1
            else:
                failed.append(tile)

        except Exception as e:
            print(f"[ERROR] {tile}: {e}")
            failed.append(tile)

        time.sleep(0.2)

    print()
    print("=" * 60)
    print("DOWNLOAD COMPLETE")
    print("=" * 60)
    print(f"Successful: {successful}/{len(TILES)}")
    print(f"Failed:     {len(failed)}")

    if failed:
        print("Failed tiles:")
        print(" ".join(failed))

    print("=" * 60)


if __name__ == "__main__":
    main()