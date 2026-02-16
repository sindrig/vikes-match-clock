import pytest
import respx
from httpx import Response

from app.models.weather import WeatherResponse
from app.services.weather import get_weather

VEDUR_URL = (
    "https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=1472"
)
OWM_URL = "https://api.openweathermap.org/data/2.5/weather"

VEDUR_XML = """<?xml version="1.0" encoding="utf-8"?>
<observations>
  <station>
    <T>12.5</T>
  </station>
</observations>"""

LAT = 64.1175
LON = -21.8537


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_owm_success():
    respx.get(OWM_URL).mock(
        return_value=Response(
            200,
            json={
                "main": {"temp": 8.3, "temp_max": 9.0},
                "weather": [{"main": "Clouds"}],
            },
        )
    )

    result = await get_weather(LAT, LON, "test-key")

    assert isinstance(result, WeatherResponse)
    assert result.temp == 8.3
    assert result.service == "openweathermap"
    assert result.main == {"temp_max": "8.3"}


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_owm_fails_vedur_fallback():
    respx.get(OWM_URL).mock(return_value=Response(500, text="Server Error"))
    respx.get(VEDUR_URL).mock(return_value=Response(200, text=VEDUR_XML))

    result = await get_weather(LAT, LON, "test-key")

    assert result.temp == 12.5
    assert result.service == "vedur.is"
    assert result.main == {"temp_max": "12.5"}


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_owm_bad_response_vedur_fallback():
    respx.get(OWM_URL).mock(return_value=Response(200, text="not json at all"))
    respx.get(VEDUR_URL).mock(return_value=Response(200, text=VEDUR_XML))

    result = await get_weather(LAT, LON, "test-key")

    assert result.temp == 12.5
    assert result.service == "vedur.is"


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_both_fail():
    respx.get(OWM_URL).mock(return_value=Response(500, text="Error"))
    respx.get(VEDUR_URL).mock(return_value=Response(500, text="Error"))

    with pytest.raises(Exception):
        await get_weather(LAT, LON, "test-key")


@pytest.mark.asyncio
@respx.mock
async def test_get_weather_owm_sends_correct_params():
    route = respx.get(OWM_URL).mock(
        return_value=Response(
            200,
            json={"main": {"temp": 10.0}},
        )
    )

    await get_weather(LAT, LON, "my-api-key")

    assert route.called
    request = route.calls[0].request
    assert f"lat={LAT}" in str(request.url)
    assert f"lon={LON}" in str(request.url)
    assert "appid=my-api-key" in str(request.url)
    assert "units=metric" in str(request.url)


@respx.mock
def test_weather_endpoint_owm_success(client):
    respx.get(OWM_URL).mock(
        return_value=Response(
            200,
            json={
                "main": {"temp": 8.3, "temp_max": 9.0},
                "weather": [{"main": "Clouds"}],
            },
        )
    )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.routers.weather.get_weather_api_key",
            lambda: "test-key",
        )
        response = client.get("/weather/", params={"lat": LAT, "lon": LON})

    assert response.status_code == 200
    data = response.json()
    assert data["temp"] == 8.3
    assert data["service"] == "openweathermap"
    assert data["main"]["temp_max"] == "8.3"


@respx.mock
def test_weather_endpoint_both_fail_returns_500(client):
    respx.get(OWM_URL).mock(return_value=Response(500, text="Error"))
    respx.get(VEDUR_URL).mock(return_value=Response(500, text="Error"))

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.routers.weather.get_weather_api_key",
            lambda: "test-key",
        )
        response = client.get("/weather/", params={"lat": LAT, "lon": LON})

    assert response.status_code == 500


def test_weather_endpoint_requires_params(client):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.routers.weather.get_weather_api_key",
            lambda: "test-key",
        )
        response = client.get("/weather/")

    assert response.status_code == 422
