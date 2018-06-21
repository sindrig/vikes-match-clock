import pprint
import json
import requests


def main():
    r = requests.get(
        'http://www.ruv.is/sites/all/themes/at_ruv/scripts/'
        'ruv-stream.php?format=json&channel=ruv'
    )
    r.raise_for_status()
    return r.json()


def handler(json_input, context):
    data = main()
    return {
        # TODO think about other status codes
        'statusCode': 200,
        'body': json.dumps(data),
        'headers': {
            'Access-Control-Allow-Origin': '*',
        },
    }


if __name__ == '__main__':
    pprint.pprint(
        json.loads(
            handler(
                {},
                None
            )['body']
        )
    )
