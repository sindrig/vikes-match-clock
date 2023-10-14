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
    bold = workbook.add_format({'bold': True})

    worksheet = workbook.add_worksheet()
    for i, (club_id, players) in enumerate(match.items()):
        worksheet.write(0, i * 4, club_id)
        for j, player in enumerate(players):
            fmt = bold if player['show'] else None
            worksheet.write(j + 1, i * 4 + 0, player['number'], fmt)
            worksheet.write(j + 1, i * 4 + 1, player['name'], fmt)
            worksheet.write(j + 1, i * 4 + 2, player['role'], fmt)
    workbook.close()
    return excel_io.getvalue()
