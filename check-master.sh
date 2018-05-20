if [ -z ${LAMBCI_BRANCH+x} ]; then
    LAMBCI_BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi
[[ "$LAMBCI_BRANCH" == "master" ]] || { echo >&2 "Not on master ($LAMBCI_BRANCH)"; exit 1; }
