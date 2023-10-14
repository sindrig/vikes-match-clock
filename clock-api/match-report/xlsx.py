import io
import traceback

import xlsxwriter

from .client import ksi_client
from .errors import ApiError


def match_to_xlsx(match_id):
    excel_io = io.BytesIO()
    try:
        match = ksi_client.get_players(match_id)
        if 'error' in match:
            raise ApiError(match['error'])
    except Exception:
        traceback.print_exc()
        raise ApiError("Match not found")
    workbook = xlsxwriter.Workbook(excel_io)
    worksheet = workbook.add_worksheet()
    for i, (club_id, players) in enumerate(match.items()):
        worksheet.write(i, i * 4, club_id)
        for j, player in enumerate(players):
            worksheet.write(i, i * 4 + j + 1, player['number'])
            worksheet.write(i, i * 4 + j + 1, player['name'])
    workbook.close()
    return excel_io.getvalue()
