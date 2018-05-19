rm -rf ./out
mkdir out
SIZE="174x116"
for f in *.jpg; do
    convert "$f" -resize "$SIZE" "out/$f"
done
