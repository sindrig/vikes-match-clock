import functools
import json
import os
from typing import TypedDict
from xml.dom import minidom

import boto3
import requests

LAT = 64.11755656328036
LON = -21.853710717824324

PREFER_VEDURIS = os.getenv("PREFER_VEDURIS", "1") == "1"

ssm = boto3.client('ssm')


@functools.cache
def weather_api_key():
    return ssm.get_parameter(
        Name='/vikes-match-clock/weather-api', WithDecryption=True
    )['Parameter']['Value']


class ResponseType(TypedDict):
    temp: float
    service: str


class LegacyNested(TypedDict):
    temp_max: str


class LegacyResponseType(ResponseType):
    main: LegacyNested


def lambda_handler(json_input, context):
    response = None
    body = '{"error": "no response"}'
    status_code = 200
    if PREFER_VEDURIS:
        r = requests.get(
            'https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=1472'
        )
        if r.ok:
            print("Using vedur.is")
            data = minidom.parseString(r.text)
            temps = data.getElementsByTagName("T")
            response = ResponseType(
                temp=float(temps[0].firstChild.data.replace(',', '.')),
                service='vedur.is',
            )
    if not response:
        print("Using openweathermap")
        r = requests.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={
                'lat': LAT,
                'lon': LON,
                'appid': weather_api_key(),
                'units': 'metric',
            },
        )
        if r.ok:
            data = r.json()
            response = ResponseType(
                temp=float(data['main']['temp']), service='openweathermap'
            )
        else:
            status_code, body = 500, r.text
    if response:
        response = LegacyResponseType(
            temp=response['temp'],
            service=response['service'],
            main=LegacyNested(temp_max=f"{response['temp']:.2f}"),
        )
        body = json.dumps(response)
    return {
        'statusCode': status_code,
        'body': body,
        'headers': {
            'Access-Control-Allow-Origin': '*',
        },
    }


if __name__ == '__main__':
    print(lambda_handler({}, {}))
