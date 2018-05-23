# Usage: ./cloudformation.sh ACTION STACK_NAME DOMAIN
ACTION=$1;
STACK_NAME=${2:-klukka};
DOMAIN="$STACK_NAME.irdn.is";
SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"

run-stack-action() {
    ACTION_NAME=$1;
    CMD="aws cloudformation $ACTION_NAME \
        --stack-name $STACK_NAME \
        --profile irdn \
        --region eu-west-1 \
        --capabilities CAPABILITY_IAM"
    if [[ $ACTION_NAME != delete-stack ]]; then
        CMD="$CMD \
        --template-body file://$SCRIPTPATH/match-clock-template.json \
        --parameters ParameterKey=Domain,ParameterValue=$DOMAIN"
    fi
    echo $CMD
    $CMD
    sleep 5
    wait-stack
}

wait-stack() {
    OUT=$(
        aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --profile irdn \
        --region eu-west-1
    )
    STATUS=$(echo $OUT | jq '.["Stacks"][0]["StackStatus"]')
    echo $STATUS;
    case $STATUS in
        *COMPLETE*)
            echo "Finished!";
            ;;
        *)
            sleep 5;
            wait-stack;
            ;;
    esac
}

main() {
    case $1 in
        create)
            run-stack-action create-stack;
            ;;
        update)
            run-stack-action update-stack;
            ;;
        delete)
            run-stack-action delete-stack;
            ;;
        wait-stack)
            wait-stack
            ;;
        *)
            echo "Unknown action $ACTION"
            ;;
    esac
}

main $ACTION;
