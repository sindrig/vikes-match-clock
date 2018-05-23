SEDS=''
unzip Klukkumyndir.zip
rm -rf pngs
mkdir pngs
mv *.png pngs
cd pngs
# find -mindepth 1 -exec sh -c 'mv "$1" "$(echo "$1" | iconv -f iso-8859-1 -t utf8 )"' sh {} \;
find -mindepth 1 -exec sh -c 'mv "$1" "$(echo "$1" | iconv -f iso-8859-1 -t utf8 | sed -r "s/\+\¡/í/g" | sed -r "s/\+\¦/ð/g" | sed -r "s/\+\û/Ö/g" | sed -r "s/\+\×/Þ/g")"' sh {} \;
mv '06 Halldðr Sm+íri Sigurðsson.png' '06 Halldór Smári Sigurðsson.png'