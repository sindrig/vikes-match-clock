import requests
import boto3

LAT = 64.11755656328036
LON = -21.853710717824324

ssm = boto3.client('ssm')
weather_api_key = ssm.get_parameter(
    Name='/vikes-match-clock/weather-api', WithDecryption=True
)['Parameter']['Value']


def lambda_handler(json_input, context):
    r = requests.get(
        'https://api.openweathermap.org/data/2.5/weather',
        params={
            'lat': LAT,
            'lon': LON,
            'appid': weather_api_key,
            'units': 'metric',
        },
    )
    status_code = 200
    if r.ok:
        body = r.text
    else:
        status_code, body = 500, r.text
    return {
        'statusCode': status_code,
        'body': body,
        'headers': {
            'Access-Control-Allow-Origin': '*',
        },
    }


if __name__ == '__main__':
    print(lambda_handler({}, {}))
