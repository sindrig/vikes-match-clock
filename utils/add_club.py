#!/usr/bin/env python
import argparse
import os

import bs4
import requests

PAGE = 'https://www.ksi.is/mot/felog/adildarfelog/'
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_absolute_url(absolute_path):
    return 'https://www.ksi.is%s' % (absolute_path, )


def main(club_id, out_folder):
    r = requests.get(f'https://www.ksi.is/mot/felag/?lid={club_id}')
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, 'html.parser')
    h1 = soup.find('h1')
    club_name = h1.text.split('-')[1].strip()
    img_url = soup.find('img')['src']

    ext = os.path.splitext(img_url)[1]
    path = os.path.join(
        out_folder,
        '%s%s' % (club_name, ext)
    )
    if os.path.isfile(path):
        print('%s exists' % (path, ))
    else:
        r2 = requests.get(get_absolute_url(img_url))
        r2.raise_for_status()
        with open(path, 'wb') as f:
            for chunk in r2.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
        print('Saved %s for %s' % (path, club_name, ))

    club_ids = os.path.join(BASE, 'src', 'club-ids.js')
    line = "    '%s': '%s',\n" % (club_name, club_id)
    with open(club_ids, 'r') as f:
        lines = f.readlines()
    if line not in lines:
        lines[1:-1] = sorted(lines[1:-1] + [line])
        with open(club_ids, 'w') as f:
            for line in lines:
                f.write(line)

    club_logos = os.path.join(BASE, 'src', 'images', 'clubLogos.js')
    line = "    %s: require('./%s'),\n" % (
        club_name,
        os.path.relpath(path, os.path.dirname(club_logos))
    )
    with open(club_logos, 'r') as f:
        lines = f.readlines()
    if line not in lines:
        lines[2:-1] = sorted(lines[2:-1] + [line])
        with open(club_logos, 'w') as f:
            for line in lines:
                f.write(line)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    folder = os.path.join(
        BASE,
        'src',
        'images',
        'club-logos'
    )
    parser.add_argument('club_id', type=int)
    args = parser.parse_args()
    main(args.club_id, folder)
