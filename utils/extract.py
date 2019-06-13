#!/usr/bin/env python

import zipfile
import shutil
import os
import argparse

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extracted')


def main(filename):
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.mkdir(OUT)
    with zipfile.ZipFile(filename, 'r') as zip_object:
        for info in zip_object.filelist:
            with open(os.path.join(OUT, info.filename), 'wb') as f:
                f.write(zip_object.read(info))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('filename')
    args = parser.parse_args()
    main(args.filename)
