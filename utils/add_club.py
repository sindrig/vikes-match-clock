#!/usr/bin/env python
import argparse
import os

import bs4
import requests

PAGE = 'https://www.ksi.is/mot/felog/adildarfelog/'
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_absolute_url(absolute_path):
    return 'https://www.ksi.is%s' % (absolute_path,)


def main(club_id, out_folder, club_name=None):
    r = requests.get(get_absolute_url(f'/mot/felag/?lid={club_id}'))
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, 'html.parser')
    h1 = soup.find('h1')
    if not h1:
        raise RuntimeError("No h1 found")
    if not club_name:
        club_name = h1.text.split('-')[1].strip()
        if not club_name:
            raise RuntimeError("Club name not found")
    for img_tag in soup.findAll('img'):
        if img_tag.get('alt', '') == 'Model.BasicInfo.ShortName':
            img_url = img_tag['src']
            break
    else:
        raise RuntimeError("Did not find img!")

    exts = [os.path.splitext(str(img_url))[1], '.svg']
    for ext in exts:
        path = os.path.join(out_folder, '%s%s' % (club_name, ext))
        if os.path.isfile(path):
            print('%s exists' % (path,))
            break
    else:
        path = os.path.join(out_folder, '%s%s' % (club_name, exts[0]))
        r2 = requests.get(get_absolute_url(img_url))
        r2.raise_for_status()
        with open(path, 'wb') as f:
            for chunk in r2.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
        print(
            'Saved %s for %s'
            % (
                path,
                club_name,
            )
        )

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
        os.path.relpath(path, os.path.dirname(club_logos)),
    )
    with open(club_logos, 'r') as f:
        lines = f.readlines()
    if line not in lines:
        lines[2:-1] = sorted(lines[2:-1] + [line])
        with open(club_logos, 'w') as f:
            for line in lines:
                f.write(line)


def get_club_id(club_name):
    r = requests.get(
        get_absolute_url(
            f'/leit/?searchstring={club_name}&contentcategories=F%c3%a9l%c3%b6g'
        )
    )
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, 'html.parser')
    all_h2 = soup.findAll('h2')
    for h2 in all_h2:
        if h2.text == club_name:
            a = h2.find('a')
            if not a:
                raise RuntimeError("No link found in search result")
            href = a['href']
            return int(href.replace('/mot/lid/?lid=', ''))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    folder = os.path.join(BASE, 'src', 'images', 'club-logos')
    parser.add_argument('club_id', type=str)
    args = parser.parse_args()
    club_name = None
    if args.club_id.isdigit():
        club_id = int(args.club_id)
    else:
        club_id = get_club_id(args.club_id)
        club_name = args.club_id
    main(club_id, folder, club_name=club_name)
