import io

import xlsxwriter

from .models import MatchInfo


def match_to_xlsx(match: MatchInfo):
    excel_io = io.BytesIO()
    workbook = xlsxwriter.Workbook(excel_io)
    bold = workbook.add_format({'bold': True})
    worksheet = workbook.add_worksheet()
    for i, color in enumerate(
        ['red', 'green', 'blue', 'yellow', 'brown', 'grey', 'pink', 'orange']
    ):
        color_fmt = workbook.add_format()
        color_fmt.set_bg_color(color)
        for col in (1, 9):
            worksheet.conditional_format(
                0,
                col,
                999,
                col,
                {
                    'type': 'cell',
                    'criteria': '==',
                    'value': i + 1,
                    'format': color_fmt,
                },
            )
    worksheet.write(0, 0, match.home_team_name)
    worksheet.write(0, 8, match.away_team_name)
    for i, players in enumerate([match.home_team, match.away_team]):
        for j, player in enumerate(
            sorted(players, key=lambda p: not p['show'])
        ):
            fmt = bold if player['show'] else None
            worksheet.write(j + 1, i * 8 + 0, player.get('number', ''), fmt)
            worksheet.write(j + 1, i * 8 + 2, player['name'], fmt)
            worksheet.write(j + 1, i * 8 + 3, player['role'], fmt)
    if match.refs:
        for i, ref in enumerate(match.refs):
            worksheet.write(i + 1, 14, ref['name'], bold)
            worksheet.write(i + 1, 15, ref['role'])
    workbook.close()
    return excel_io.getvalue()


if __name__ == '__main__':
    buf = match_to_xlsx(
        MatchInfo(
            match_name='2036448',
            home_team_name='Iceland',
            home_team=[
                {
                    'id': '250042038',
                    'name': 'Rúnar Rúnarsson',
                    'number': 1,
                    'role': 'GOALKEEPER',
                    'show': True,
                },
                {
                    'id': '250078904',
                    'name': 'Alfons Sampsted',
                    'number': 2,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '1902218',
                    'name': 'Victor Pálsson',
                    'number': 4,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250019892',
                    'name': 'Sverrir Ingason',
                    'number': 5,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250128943',
                    'name': 'Hákon Arnar Haraldsson',
                    'number': 7,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250089663',
                    'name': 'Arnór Sigurdsson',
                    'number': 8,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250066813',
                    'name': 'Kolbeinn Finnsson',
                    'number': 14,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250102754',
                    'name': 'Willum Thor Willumsson',
                    'number': 15,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250126512',
                    'name': 'Ísak Bergmann Johannesson',
                    'number': 19,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250129690',
                    'name': 'Orri Óskarsson',
                    'number': 20,
                    'role': 'FORWARD',
                    'show': True,
                },
                {
                    'id': '250012840',
                    'name': 'Arnór Ingvi Traustason',
                    'number': 21,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250138317',
                    'name': 'Hakon Rafn Valdimarsson',
                    'number': 12,
                    'role': 'GOALKEEPER',
                    'show': False,
                },
                {
                    'id': '250102765',
                    'name': 'Elias Rafn Ólafsson',
                    'number': 13,
                    'role': 'GOALKEEPER',
                    'show': False,
                },
                {
                    'id': '250004701',
                    'name': 'Gudmundur Thórarinsson',
                    'number': 3,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250023158',
                    'name': 'Hjörtur Hermannsson',
                    'number': 6,
                    'role': 'DEFENDER',
                    'show': False,
                },
                {
                    'id': '250078893',
                    'name': 'Jón Dagur Thorsteinsson',
                    'number': 9,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '102293',
                    'name': 'Gylfi Sigurdsson',
                    'number': 10,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250011522',
                    'name': 'Alfred Finnbogason',
                    'number': 11,
                    'role': 'FORWARD',
                    'show': False,
                },
                {
                    'id': '250068932',
                    'name': 'Julius Magnusson',
                    'number': 16,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '102287',
                    'name': 'Aron Gunnarsson',
                    'number': 17,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250085610',
                    'name': 'Mikael Anderson',
                    'number': 18,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250106953',
                    'name': 'Andri Gudjohnsen',
                    'number': 22,
                    'role': 'FORWARD',
                    'show': False,
                },
                {
                    'id': '250138124',
                    'name': 'Kristian Hlynsson',
                    'number': 23,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250099754',
                    'name': 'Åge Hareide',
                    'role': 'COACH',
                    'show': False,
                },
            ],
            away_team_name='Luxembourg',
            away_team=[
                {
                    'id': '1905003',
                    'name': 'Anthony Moris',
                    'number': 1,
                    'role': 'GOALKEEPER',
                    'show': True,
                },
                {
                    'id': '250059286',
                    'name': 'Maxime Chanot',
                    'number': 2,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250071393',
                    'name': 'Enes Mahmutovic',
                    'number': 3,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250127174',
                    'name': 'Alessio Curci',
                    'number': 5,
                    'role': 'FORWARD',
                    'show': True,
                },
                {
                    'id': '250047077',
                    'name': 'Christopher Martins',
                    'number': 8,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250087960',
                    'name': 'Danel Sinani',
                    'number': 10,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250089631',
                    'name': 'Vincent Thill',
                    'number': 11,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250079463',
                    'name': 'Dirk Carlson',
                    'number': 13,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250127178',
                    'name': 'Eldin Dzogovic',
                    'number': 15,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250089626',
                    'name': 'Leandro Barreiro',
                    'number': 16,
                    'role': 'MIDFIELDER',
                    'show': True,
                },
                {
                    'id': '250155876',
                    'name': 'Mica Pinto',
                    'number': 17,
                    'role': 'DEFENDER',
                    'show': True,
                },
                {
                    'id': '250096355',
                    'name': 'Ralph Schon',
                    'number': 12,
                    'role': 'GOALKEEPER',
                    'show': False,
                },
                {
                    'id': '250167021',
                    'name': 'Tiago Pereira',
                    'number': 23,
                    'role': 'GOALKEEPER',
                    'show': False,
                },
                {
                    'id': '250108119',
                    'name': 'Seid Korac',
                    'number': 4,
                    'role': 'DEFENDER',
                    'show': False,
                },
                {
                    'id': '250183751',
                    'name': 'Aiman Dardari',
                    'number': 6,
                    'role': 'FORWARD',
                    'show': False,
                },
                {
                    'id': '104072',
                    'name': 'Lars Gerson',
                    'number': 7,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250107439',
                    'name': 'Gerson Rodrigues',
                    'number': 9,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250083559',
                    'name': 'Olivier Thill',
                    'number': 14,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250023658',
                    'name': 'Laurent Jans',
                    'number': 18,
                    'role': 'DEFENDER',
                    'show': False,
                },
                {
                    'id': '250108122',
                    'name': 'Mathias Olesen',
                    'number': 19,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250127187',
                    'name': 'Timothe Rupil',
                    'number': 20,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250083558',
                    'name': 'Sébastien Thill',
                    'number': 21,
                    'role': 'MIDFIELDER',
                    'show': False,
                },
                {
                    'id': '250047078',
                    'name': 'Marvin Martins',
                    'number': 22,
                    'role': 'DEFENDER',
                    'show': False,
                },
                {
                    'id': '8581',
                    'name': 'Luc Holtz',
                    'role': 'COACH',
                    'show': False,
                },
            ],
            refs=[
                {'name': 'Sebastian Gishamer', 'role': 'REFEREE'},
                {'name': 'Mehmet Ilgaz', 'role': 'REFEREE_OBSERVER'},
                {'name': 'Roland Riedel', 'role': 'ASSISTANT_REFEREE_ONE'},
                {'name': 'Santino Schreiner', 'role': 'ASSISTANT_REFEREE_TWO'},
                {'name': 'Walter Altmann', 'role': 'FOURTH_OFFICIAL'},
                {
                    'name': 'Manuel Schuettengruber',
                    'role': 'VIDEO_ASSISTANT_REFEREE',
                },
                {'name': 'Bert Andersson', 'role': 'UEFA_DELEGATE'},
                {
                    'name': 'Alan Kijas',
                    'role': 'ASSISTANT_VIDEO_ASSISTANT_REFEREE',
                },
            ],
        )
    )
    with open('x.xlsx', 'wb') as f:
        f.write(buf)
