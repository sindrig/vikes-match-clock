import argparse
import functools
import glob
import pathlib
import shutil
import typing
from enum import StrEnum

import bs4
import cv2
import numpy as np
import requests
import skimage.exposure
from PIL import Image


class Type_(StrEnum):
    Beinn = 'Beinn'
    Hægri = 'Hægri'
    Vinstri = 'Vinstri'
    Fagn = 'Fagn'
    Kross = 'Kross'
    beinn = 'Beinn'
    hægri = 'Hægri'
    vinstri = 'Vinstri'
    fagn = 'Fagn'
    kross = 'Kross'


link_prefix = '/mot/leikmadur/?leikmadur='


def result_sorter(name: str):
    def inner(result):
        return result.text.startswith(name) + ('Víkingur' in result.text)

    return inner


@functools.cache
def find_player(name: str) -> int:
    r = requests.get(
        'https://www.ksi.is/leit/',
        params={'searchstring': name, 'contentcategories': 'Leikmenn'},
    )
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, 'html.parser')
    sorted_results = list(
        reversed(
            sorted(
                soup.findAll('div', {'class': 'result-box'}),
                key=result_sorter(name),
            )
        )
    )
    for result in sorted_results:
        href = result.find('a')['href']
        if link_prefix in href:
            _, pid = href.split(link_prefix)
            print('Matched', result.text, 'with', name, 'and pid', pid)
            return int(pid)
    raise ValueError(name)


def image_handler(
    f: typing.Callable[[pathlib.Path, pathlib.Path], None]
) -> typing.Callable[[pathlib.Path, pathlib.Path], None]:
    def inner(in_fldr: pathlib.Path, out_fldr: pathlib.Path):
        files = glob.glob(str(in_fldr / '*.png'))
        for fn in files:
            f(pathlib.Path(fn), out_fldr)

    return inner


@image_handler
def convert_pids(fn: pathlib.Path, out_fldr: pathlib.Path):
    if '_' in fn.stem and ' ' in fn.stem:
        num_name, type_ = fn.stem.split('_')
    elif ' ' in fn.stem:
        parts = fn.stem.split(' ')
        type_ = parts[-1]
        num_name = ' '.join(parts[:-1])
    else:
        raise RuntimeError(fn.stem)
    num, name = num_name.split(maxsplit=1)
    try:
        Type_[type_]
    except KeyError:
        return
    try:
        pid = find_player(name)
    except ValueError:
        if not num.isdigit():
            print('Skipping', name)
            return
        else:
            raise
    if Type_[type_] == Type_.Beinn:
        new_type_name = ''
    else:
        new_type_name = f'-{type_.lower()}'
    shutil.copy(fn, out_fldr / f'{pid}{new_type_name}.png')


@image_handler
def crop(fn: pathlib.Path, out_fldr: pathlib.Path):
    img = Image.open(fn)
    bbox = img.getbbox()
    cropped_bbox = img.crop(bbox)
    box = (0, 0, cropped_bbox.width, int(cropped_bbox.width / (240 / 176)))
    cropped = cropped_bbox.crop(box)
    resized = cropped.resize((240, 176))
    resized.save(out_fldr / fn.name)


@image_handler
def greenscreen(fn: pathlib.Path, out_fldr: pathlib.Path):
    frame = cv2.imread(fname, cv2.COLOR_BGR2BGRA)
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)

    # extract A channel
    A = lab[:, :, 1]

    # threshold A channel
    thresh = cv2.threshold(A, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    # blur threshold image
    blur = cv2.GaussianBlur(
        thresh, (0, 0), sigmaX=5, sigmaY=5, borderType=cv2.BORDER_DEFAULT
    )

    # stretch so that 255 -> 255 and 127.5 -> 0
    mask = skimage.exposure.rescale_intensity(
        blur, in_range=(127.5, 255), out_range=(0, 255)
    ).astype(np.uint8)

    # add mask to image as alpha channel
    result = frame.copy()
    result = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2BGRA)
    result[:, :, 3] = mask
    cv2.imwrite(out_fldr / fn.name, result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input_folder', type=pathlib.Path)
    parser.add_argument('output_folder', type=pathlib.Path)

    subparsers = parser.add_subparsers()

    pids_parser = subparsers.add_parser('pids')
    pids_parser.set_defaults(func=convert_pids)

    crops_parser = subparsers.add_parser('crop')
    crops_parser.set_defaults(func=crop)

    crops_parser = subparsers.add_parser('greenscreen')
    crops_parser.set_defaults(func=greenscreen)

    args = parser.parse_args()
    assert args.output_folder.exists()
    assert hasattr(args, 'func')
    args.func(args.input_folder, args.output_folder)
