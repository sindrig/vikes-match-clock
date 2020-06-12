#!/usr/bin/env python
import os

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
    with open(os.path.join(IMAGES_DIR, 'index.js'), 'w') as f:
        f.write('/* eslint-disable global-require */\n')
        f.write('module.exports = {\n')
        for root, dirs, files in os.walk(IMAGES_DIR):
            for fn in sorted(files, key=sort_key):
                if include(fn):
                    relpath = os.path.relpath(
                        os.path.join(root, fn),
                        IMAGES_DIR
                    )
                    loc = os.path.dirname(relpath) or os.path.basename(root)
                    key = '%s/%s' % (loc, fn)
                    f.write("    '%s': require('./%s'),\n" % (key, relpath))
        f.write('};\n')


if __name__ == '__main__':
    main()
