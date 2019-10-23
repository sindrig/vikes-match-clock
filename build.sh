#!/usr/bin/env bash
set -e

windows() {
    ./package.sh http://klukka.irdn.is --platform windows
    zip -qyr klukka.zip Vallarklukka-win32-x64/
    aws s3 cp klukka.zip s3://klukka.irdn.is/klukka.zip $EXTRA_S3
}

platform() {
    ./package.sh http://klukka.irdn.is
}

main() {
    for ACTION in "$@"
    do
        echo "Running $ACTION"
        case $ACTION in
            windows)
                windows;
                ;;
            platform)
                platform;
                ;;
            *)
                echo "Unknown action $ACTION"
                exit 1
                ;;
        esac
    done
}

main "$@"
