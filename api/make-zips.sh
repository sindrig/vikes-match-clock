#!/bin/bash
make-skyrsla() {
    (
        cd skyrsla
        pip install -t `pwd` suds-py3
        zip -qyr ../skyrsla.zip . -x@../.lambdaignore
    )
}

make-ruv() {
    (
        cd ruv
        pip install -t `pwd` requests
        zip -qyr ../ruv.zip . -x@../.lambdaignore
    )
}

make-skyrsla
make-ruv