#!/usr/bin/env bash

convert $1 -resize 238x177 -gravity center -background ${3:-white} -extent 238x177 $2