import datetime
import json
import urllib.parse

import bs4
import requests


def get_date(query):
    if "date" in query:
        return datetime.datetime.strptime(query["date"], "%Y-%m-%d").date()
    else:
        return datetime.date.today()


def get_matches(query: dict):
    date = get_date(query)
    r = requests.get(
        "https://www.ksi.is/mot/felog/leikir-felaga/",
        params={
            "Search": True,
            "felag": "",
            "vollur": query["location"],
            "flokkur": "",
            "kyn": "",
            "dagsfra": date.strftime("%d.%m.%Y"),
            "dagstil": date.strftime("%d.%m.%Y"),
        },
    )
    r.raise_for_status()
    soup = bs4.BeautifulSoup(r.text, "html.parser")
    for row in soup.select("table tbody tr"):
        cells = row.select("td")
        if len(cells) < 2:
            continue
        match_link = cells[6].find("a")
        match_id = None
        breakpoint()
        if match_link and isinstance(match_link, bs4.Tag):
            parsed = urllib.parse.urlparse(match_link.attrs["href"])
            qs = urllib.parse.parse_qs(parsed.query)
            match_id = qs["leikur"][0]
        yield {
            "date": cells[0].text.strip(),
            "time": cells[1].text.strip(),
            "home": cells[4].text.strip(),
            "away": cells[5].text.strip(),
            "matchId": match_id,
        }


def lambda_handler(json_input, context):
    print(json_input)
    query = json_input.get("queryStringParameters") or {}
    if "location" in query:
        return {
            "statusCode": 200,
            "body": json.dumps({"matches": list(get_matches(query))}),
            "headers": {
                "Access-Control-Allow-Origin": "*",
            },
        }

    return {
        "statusCode": 400,
        "body": json.dumps({"error": "Missing location from query"}),
        "headers": {
            "Access-Control-Allow-Origin": "*",
        },
    }


if __name__ == "__main__":
    print(
        lambda_handler(
            # {"queryStringParameters": {"location": 2621}},
            {"queryStringParameters": {"location": 102}},
            {},
        )
    )
