#!/usr/bin/env bash
find ./build -name '*.gz' -type f | while read NAME ; do mv "${NAME}" "${NAME%.gz}" ; done

