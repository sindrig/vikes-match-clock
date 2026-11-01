from unittest.mock import Mock, call, patch

import pytest
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import HTTPException

from app import dependencies


@pytest.fixture(autouse=True)
def clear_dependency_caches():
    caches = (
        dependencies.get_ssm_client,
        dependencies.get_ksi_api_key,
        dependencies.get_weather_api_key,
    )
    for cached in caches:
        cached.cache_clear()
    yield
    for cached in caches:
        cached.cache_clear()


def test_keys_share_one_lazy_regional_client_and_cache_separately():
    ssm = Mock()
    ssm.get_parameter.side_effect = [
        {"Parameter": {"Value": "ksi-2492"}},
        {"Parameter": {"Value": "weather"}},
        {"Parameter": {"Value": "ksi-42"}},
    ]
    with patch("app.dependencies.boto3.client", return_value=ssm) as factory:
        factory.assert_not_called()
        assert dependencies.get_ksi_api_key(2492) == "ksi-2492"
        assert dependencies.get_weather_api_key() == "weather"
        assert dependencies.get_ksi_api_key(42) == "ksi-42"
        assert dependencies.get_ksi_api_key(2492) == "ksi-2492"
        assert dependencies.get_weather_api_key() == "weather"
        assert dependencies.get_ssm_client() is ssm

    factory.assert_called_once_with("ssm", region_name="eu-west-1")
    assert ssm.get_parameter.call_args_list == [
        call(
            Name="/vikes-match-clock/ksi-api-key/2492",
            WithDecryption=True,
        ),
        call(Name="/vikes-match-clock/weather-api", WithDecryption=True),
        call(Name="/vikes-match-clock/ksi-api-key/42", WithDecryption=True),
    ]


def test_ksi_clients_remain_request_scoped_with_cached_key():
    ssm = Mock()
    ssm.get_parameter.return_value = {"Parameter": {"Value": "team-key"}}
    first, second = Mock(), Mock()
    with (
        patch("app.dependencies.boto3.client", return_value=ssm),
        patch(
            "app.dependencies.KsiClient", side_effect=[first, second]
        ) as factory,
    ):
        assert dependencies.get_ksi_client(2492) is first
        assert dependencies.get_ksi_client(2492) is second

    assert factory.call_args_list == [
        call(api_key="team-key", team_id=2492),
        call(api_key="team-key", team_id=2492),
    ]
    ssm.get_parameter.assert_called_once()


def test_failed_client_creation_is_retried_then_cached():
    ssm = Mock()
    ssm.get_parameter.return_value = {"Parameter": {"Value": "key"}}
    with patch(
        "app.dependencies.boto3.client",
        side_effect=[NoCredentialsError(), ssm],
    ) as factory:
        with pytest.raises(NoCredentialsError):
            dependencies.get_ksi_api_key(2492)
        assert dependencies.get_ksi_api_key(2492) == "key"
        assert dependencies.get_ksi_api_key(2492) == "key"

    assert factory.call_count == 2
    ssm.get_parameter.assert_called_once_with(
        Name="/vikes-match-clock/ksi-api-key/2492", WithDecryption=True
    )


@pytest.mark.parametrize(
    "get_key,args",
    [
        (dependencies.get_ksi_api_key, (2492,)),
        (dependencies.get_weather_api_key, ()),
    ],
)
def test_parameter_failure_keeps_client_but_does_not_cache_key(get_key, args):
    error = ClientError(
        {"Error": {"Code": "ParameterNotFound", "Message": "missing"}},
        "GetParameter",
    )
    ssm = Mock()
    ssm.get_parameter.side_effect = [
        error,
        {"Parameter": {"Value": "recovered"}},
    ]
    with patch("app.dependencies.boto3.client", return_value=ssm) as factory:
        with pytest.raises(ClientError) as raised:
            get_key(*args)
        assert raised.value is error
        assert get_key(*args) == "recovered"
        assert get_key(*args) == "recovered"

    factory.assert_called_once_with("ssm", region_name="eu-west-1")
    assert ssm.get_parameter.call_count == 2


def test_missing_ksi_value_preserves_http_error_and_allows_retry():
    ssm = Mock()
    ssm.get_parameter.side_effect = [
        {"Parameter": {}},
        {"Parameter": {"Value": "recovered"}},
    ]
    with patch("app.dependencies.boto3.client", return_value=ssm):
        with pytest.raises(HTTPException) as raised:
            dependencies.get_ksi_api_key(2492)
        assert raised.value.status_code == 500
        assert raised.value.detail == (
            "KSI API key not found for team_id: {team_id}"
        )
        assert dependencies.get_ksi_api_key(2492) == "recovered"
