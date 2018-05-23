import argparse
import os

import bs4
import requests

PAGE = 'https://www.ksi.is/mot/felog/adildarfelog/'
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_absolute_url(absolute_path):
    return 'https://www.ksi.is%s' % (absolute_path, )


def main(out_folder):
    known_endings = ['svg', 'png']
    r = requests.get(PAGE)
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, 'html.parser')
    table = soup.find('table')
    name_id_map = {}
    for row in table.find('tbody').find_all('tr'):
        img_url = row.find('img')['src']
        club_name = row.find('a').text
        team_id = row.find('a')['href'].split('=')[1]
        sanitized_name = club_name.replace('/', '-').rstrip('.')
        name_id_map[sanitized_name] = team_id
        if 'vantar_logo' in img_url:
            print('%s missing logo' % (club_name, ))
        elif not any([img_url.endswith(ending) for ending in known_endings]):
            print('unknown ending for %s: %s' % (club_name, img_url))
        else:
            ext = os.path.splitext(img_url)[1]
            path = os.path.join(
                out_folder,
                '%s%s' % (sanitized_name, ext)
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
    with open(os.path.join(BASE, 'src', 'club-ids.js'), 'w') as f:
        f.write('export default {\n')
        for name, _id in name_id_map.items():
            f.write("    '%s': '%s'\n" % (name, _id))
        f.write('}\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    default_folder = os.path.join(
        BASE,
        'src',
        'images',
        'club-logos'
    )
    parser.add_argument('--out_folder', default=default_folder)
    args = parser.parse_args()
    if not os.path.isabs(args.out_folder):
        raise RuntimeError(
            '%s should be absolute path' % (args.out_folder, )
        )
    if not os.path.isdir(os.path.dirname(args.out_folder)):
        raise RuntimeError(
            '%s missing parent directory' % (args.out_folder, )
        )
    if not os.path.isdir(args.out_folder):
        os.makedirs(args.out_folder)
    main(args.out_folder)
