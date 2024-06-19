import glob
import os
import re
from collections import defaultdict

replacer = re.compile(r"[ -\.]")
# replacer = re.compile(r'[^A-Za-z0-9]')

BASE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "clock",
    "src",
    "images",
)


def sanitize(s):
    f, _ = os.path.splitext(s)
    # return f.replace(' ', '')
    return replacer.sub("", f).lower()


ORDER = [".svg", ".png"]


def sort_key(fn):
    ext = os.path.splitext(fn)[1]
    if ext in ORDER:
        return ORDER.index(ext)
    return 1000


def main(outfile="clubLogos.js", image_locs="club-logos"):
    importnames: dict[str, str] = {}
    image_folder = os.path.join(BASE, image_locs)
    with open(os.path.join(BASE, outfile), "w") as f:
        filenames: dict[str, list[str]] = defaultdict(list)
        for fn in glob.glob(os.path.join(image_folder, "*")):
            filenames[os.path.splitext(fn)[0]].append(fn)
        for _, fns in filenames.items():
            fn = sorted(fns, key=sort_key)[0]
            relfn = os.path.relpath(fn, BASE)
            base_name = os.path.basename(fn)
            importname = sanitize(base_name)
            f.write(f'import {{ default as {importname} }} from "./{relfn}";\n')
            importnames[os.path.splitext(base_name)[0]] = importname
        f.write("\nexport default {\n")
        for k, v in sorted(importnames.items()):
            f.write(f'  "{k}": {v},\n')
        f.write("};\n")


if __name__ == "__main__":
    main()
