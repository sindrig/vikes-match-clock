EXTRA_S3=""
if [ -z $PROFILE ]; then
    EXTRA_S3="--profile=$PROFILE"
fi
build() {
    npm run build
}

check-master() {
    if [ -z ${LAMBCI_BRANCH+x} ]; then
        LAMBCI_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    fi
    [[ "$LAMBCI_BRANCH" == "master" ]] || { echo >&2 "Not on master ($LAMBCI_BRANCH)"; return 1; }
}

node-modules() {
    command -v npm-git-lock 2>&1 || npm install -g npm-git-lock
    export GIT_TEMPLATE_DIR='/tmp/lambci/home/usr/share/git-core/templates'
    export GIT_EXEC_PATH='/tmp/lambci/home/usr/libexec/git-core'
    echo "HAI: $(cat /tmp/lambci/home/usr/libexec/git-core | wc -l)"
    npm-git-lock --repo https://github.com/sindrig/vikes-match-clock-node-modules.git
}

deploy() {
    node_modules/.bin/s3-deploy "./build/**" --cwd "./build/" --region "eu-west-1" --bucket klukka.irdn.is --gzip $EXTRA_S3
}

windows() {
    ./package.sh http://klukka.irdn.is --platform windows
    zip -qyr klukka.zip Vallarklukka-win32-x64/
    aws s3 cp klukka.zip s3://klukka.irdn.is/klukka.zip $EXTRA_S3
}

platform() {
    ./package.sh http://klukka.irdn.is
}

lint() {
    npm run lint
}

test() {
    npm run test
}

all() {
    if check-master; then
        main node-modules lint test build deploy
        EXIT_CODE=$?
    else
        main node-modules lint test
        EXIT_CODE=$?
    fi
    exit $EXIT_CODE
}

main() {
    for ACTION in "$@"
    do
        echo "Running $ACTION"
        case $ACTION in
            build)
                build
                ;;
            check-master)
                check-master;
                ;;
            node-modules)
                node-modules;
                ;;
            deploy)
                deploy;
                ;;
            windows)
                windows;
                ;;
            platform)
                platform;
                ;;
            lint)
                lint;
                ;;
            all)
                all;
                ;;
            test)
                test;
                ;;
            *)
                echo "Unknown action $ACTION"
                exit 1
                ;;
        esac
        EXIT_CODE=$?
        if [ $EXIT_CODE -ne 0 ]; then
            echo "Exiting $ACTION with $EXIT_CODE"
            exit $EXIT_CODE
        fi
    done
    exit $?
}

main "$@"
EXIT_CODE=$?
echo "Exiting with exit code $EXIT_CODE"
exit $EXIT_CODE
