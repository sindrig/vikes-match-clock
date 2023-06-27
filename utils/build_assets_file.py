#!/usr/bin/env python
import os
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(BASE_DIR, 'src', 'assets')


def include(fn):
    return not fn.endswith('js')


def sort_key(fn):
    return (
        int(fn.split(' ')[0]) if fn.split(' ')[0].isdigit() else 99999,
        fn,
    )


def main():
    asset_file = os.path.join(IMAGES_DIR, 'index.js')
    with open(asset_file, 'w') as f:
        f.write('/* eslint-disable global-require */\n')
        f.write('module.exports = {\n')
        for root, dirs, files in os.walk(IMAGES_DIR):
            dirs.sort()
            for fn in sorted(files, key=sort_key):
                if include(fn):
                    relpath = os.path.relpath(
                        os.path.join(root, fn), IMAGES_DIR
                    )
                    loc = os.path.dirname(relpath) or os.path.basename(root)
                    key = '%s/%s' % (loc, fn)
                    f.write("    '%s': require('./%s'),\n" % (key, relpath))
        f.write('};\n')
    subprocess.run(['npx', 'prettier', '--write', asset_file], check=True)


if __name__ == '__main__':
    main()
