import os
import re

replacer = re.compile(r"[ -\.]")

BASE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "clock", "src"
)


def sanitize(s):
    f, _ = os.path.splitext(s)
    return replacer.sub("", f).lower()


def main(outfile="club-ids.js"):
    with open(os.path.join(BASE, outfile), "r") as f:
        current = [line for line in f.readlines() if line]

    with open(os.path.join(BASE, outfile), "w") as f:
        f.write(f"{current[0]}")
        for line in current[1:-1]:
            name, rest = line.split(": ", 1)
            name = sanitize(name.strip().replace('"', ""))

            f.write(f"  {name}: {rest}")
        f.write(f"{current[-1]}")


if __name__ == "__main__":
    main()
