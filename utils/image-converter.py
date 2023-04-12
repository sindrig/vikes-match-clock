import argparse
import functools
import glob
import pathlib
import shutil
import typing
from enum import StrEnum

import bs4
import requests
from PIL import Image


class Type_(StrEnum):
    Beinn = 'Beinn'
    Hægri = 'Hægri'
    Vinstri = 'Vinstri'
    Fagn = 'Fagn'
    Kross = 'Kross'


link_prefix = '/mot/leikmadur/?leikmadur='

@functools.cache
def find_player(name: str) -> int:
    r = requests.get(
        'https://www.ksi.is/leit/', params={'searchstring': name}
    )
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, 'html.parser')
    for result in soup.findAll('div', {'class': 'result-box'}):
        href = result.find('a')['href']
        if link_prefix in href:
            _, pid = href.split(link_prefix)
            return int(pid)
    raise ValueError(name)

def image_handler(f: typing.Callable[[pathlib.Path, pathlib.Path], None]) -> typing.Callable[[pathlib.Path, pathlib.Path], None]:
    def inner(in_fldr: pathlib.Path, out_fldr: pathlib.Path):
        files = glob.glob(str(in_fldr / '*.png'))
        for fn in files:
            f(pathlib.Path(fn), out_fldr)
    return inner

@image_handler
def convert_pids(fn: pathlib.Path, out_fldr: pathlib.Path):
    if '_' in fn.stem and ' ' in fn.stem:
        num_name, type_ = fn.stem.split('_')
        _, name = num_name.split(maxsplit=1)
        try:
            Type_[type_]
        except KeyError:
            return
        pid = find_player(name)
        match Type_[type_]:
            case Type_.Beinn:
                new_type_name = ''
            case _:
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input_folder', type=pathlib.Path)
    parser.add_argument('output_folder', type=pathlib.Path)

    subparsers = parser.add_subparsers()

    pids_parser = subparsers.add_parser('pids')
    pids_parser.set_defaults(func=convert_pids)

    crops_parser = subparsers.add_parser('crop')
    crops_parser.set_defaults(func=crop)

    args = parser.parse_args()
    assert args.output_folder.exists()
    assert hasattr(args, 'func')
    args.func(args.input_folder, args.output_folder)
