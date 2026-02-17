// Automatically generated from game_balance.xlsm
const GAME_BALANCE_DATA = {
    "PHYSICS": {
        "BASE_ACCEL": 0.03,
        "BASE_MAX_SPEED": 6.0,
        "BRAKE_FORCE": 0.15,
        "FRICTION": 0.99,
        "CARGO_HP_BASE": 100.0,
        "MISSION_SCALE": 120.0,
        "MISSILE_DAMAGE": 40.0,
        "MISSILE_COOLDOWN": 60.0
    },
    "PLAYER": {
        "HP": 100,
        "ENGINE": 100,
        "ACCEL": 100,
        "SPEED": 550,
        "BRAKE": 80,
        "WEAPON_OS": 120,
        "GRID_W": 2,
        "GRID_H": 2
    },
    "WEAPONS": {
        "BeamGun": {
            "ID": "BeamGun",
            "Name": "ビームガン",
            "Type": "Main",
            "Damage": 10,
            "Speed": 10,
            "Interval": 30,
            "W": 1,
            "H": 2,
            "Weight": 10,
            "Homing": 0,
            "Count": 1,
            "UpgradeCost": 1000
        },
        "Missile": {
            "ID": "Missile",
            "Name": "ミサイル",
            "Type": "Sub",
            "Damage": 20,
            "Speed": 6,
            "Interval": 90,
            "W": 1,
            "H": 3,
            "Weight": 20,
            "Homing": 2,
            "Count": 2,
            "UpgradeCost": 2000
        },
        "Bomb": {
            "ID": "Bomb",
            "Name": "ボム",
            "Type": "Sub",
            "Damage": 30,
            "Speed": 5,
            "Interval": 180,
            "W": 2,
            "H": 2,
            "Weight": 30,
            "Homing": 0,
            "Count": 1,
            "UpgradeCost": 3000,
            "Range": 120.0
        },
        "TwinBeam": {
            "ID": "TwinBeam",
            "Name": "ツインビーム",
            "Type": "Main",
            "Damage": 18,
            "Speed": 12,
            "Interval": 25,
            "W": 2,
            "H": 2,
            "Weight": 15,
            "Homing": 0,
            "Count": 2,
            "UpgradeCost": 2500
        },
        "Laser": {
            "ID": "Laser",
            "Name": "レーザー",
            "Type": "Main",
            "Damage": 25,
            "Speed": 999,
            "Interval": 120,
            "W": 2,
            "H": 3,
            "Weight": 30,
            "Homing": 0,
            "Count": 1,
            "UpgradeCost": 4000,
            "Range": 300.0
        }
    },
    "ENEMIES": {
        "TypeA": {
            "ID": "TypeA",
            "Name": "Enemy A",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeB": {
            "ID": "TypeB",
            "Name": "Enemy B",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeC": {
            "ID": "TypeC",
            "Name": "Enemy C",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeD": {
            "ID": "TypeD",
            "Name": "Enemy D",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeE": {
            "ID": "TypeE",
            "Name": "Enemy E",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeF": {
            "ID": "TypeF",
            "Name": "Enemy F",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeG": {
            "ID": "TypeG",
            "Name": "Enemy G",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeH": {
            "ID": "TypeH",
            "Name": "Enemy H",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeI": {
            "ID": "TypeI",
            "Name": "Enemy I",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeJ": {
            "ID": "TypeJ",
            "Name": "Enemy J",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeK": {
            "ID": "TypeK",
            "Name": "Enemy K",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeL": {
            "ID": "TypeL",
            "Name": "Enemy L",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeM": {
            "ID": "TypeM",
            "Name": "Enemy M",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeN": {
            "ID": "TypeN",
            "Name": "Enemy N",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeO": {
            "ID": "TypeO",
            "Name": "Enemy O",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeP": {
            "ID": "TypeP",
            "Name": "Enemy P",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeQ": {
            "ID": "TypeQ",
            "Name": "Enemy Q",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeR": {
            "ID": "TypeR",
            "Name": "Enemy R",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeS": {
            "ID": "TypeS",
            "Name": "Enemy S",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeT": {
            "ID": "TypeT",
            "Name": "Enemy T",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        },
        "TypeU": {
            "ID": "TypeU",
            "Name": "Enemy U",
            "HP": 100,
            "Speed": 1,
            "Weapon": "Beam",
            "DropRate": 0.1
        }
    },
    "DEBRIS": {
        "TIERS": [
            {
                "id": "TypeA",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeB",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeC",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeD",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeE",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeF",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeG",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeH",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeI",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeJ",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeK",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeL",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeM",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeN",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeO",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeP",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeQ",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeR",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeS",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeT",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            },
            {
                "id": "TypeU",
                "hp": 100,
                "speed": 1,
                "homing": 0,
                "color": "#e74c3c"
            }
        ]
    },
    "PART_TEMPLATES": {
        "WeaponOS": {
            "ID": "WeaponOS",
            "Name": "武器管制OS",
            "Type": "Option",
            "W": 2,
            "H": 2,
            "Price": 2000,
            "Desc": "OS性能アップ",
            "UpgradeCost": 1500
        },
        "Collector": {
            "ID": "Collector",
            "Name": "回収アーム",
            "Type": "Option",
            "W": 1,
            "H": 3,
            "Price": 1500,
            "Desc": "回収範囲アップ",
            "UpgradeCost": 1000
        },
        "Shield": {
            "ID": "Shield",
            "Name": "シールド",
            "Type": "Option",
            "W": 1,
            "H": 2,
            "Price": 3000,
            "Desc": "ダメージ軽減",
            "UpgradeCost": 2000
        },
        "ItemEff": {
            "ID": "ItemEff",
            "Name": "アイテム効率化",
            "Type": "Option",
            "W": 1,
            "H": 1,
            "Price": 1000,
            "Desc": "バフ時間延長",
            "UpgradeCost": 800
        }
    },
    "UPGRADE_TABLE": {
        "HP": [
            {
                "StatType": "HP",
                "Level": 0,
                "ValuePlus": 0,
                "Cost": 0,
                "MaterialCount": 0
            },
            {
                "StatType": "HP",
                "Level": 1,
                "ValuePlus": 10,
                "Cost": 610,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 2,
                "ValuePlus": 20,
                "Cost": 740,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 3,
                "ValuePlus": 30,
                "Cost": 890,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 4,
                "ValuePlus": 40,
                "Cost": 1060,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 5,
                "ValuePlus": 50,
                "Cost": 1250,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 6,
                "ValuePlus": 60,
                "Cost": 1460,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 7,
                "ValuePlus": 70,
                "Cost": 1690,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 8,
                "ValuePlus": 80,
                "Cost": 1940,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 9,
                "ValuePlus": 90,
                "Cost": 2210,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "HP",
                "Level": 10,
                "ValuePlus": 100,
                "Cost": 2500,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 11,
                "ValuePlus": 110,
                "Cost": 2810,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 12,
                "ValuePlus": 120,
                "Cost": 3140,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 13,
                "ValuePlus": 130,
                "Cost": 3490,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 14,
                "ValuePlus": 140,
                "Cost": 3860,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 15,
                "ValuePlus": 150,
                "Cost": 4250,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 16,
                "ValuePlus": 160,
                "Cost": 4660,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 17,
                "ValuePlus": 170,
                "Cost": 5090,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 18,
                "ValuePlus": 180,
                "Cost": 5540,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 19,
                "ValuePlus": 190,
                "Cost": 6010,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "HP",
                "Level": 20,
                "ValuePlus": 200,
                "Cost": 6500,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 21,
                "ValuePlus": 210,
                "Cost": 7010,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 22,
                "ValuePlus": 220,
                "Cost": 7540,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 23,
                "ValuePlus": 230,
                "Cost": 8090,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 24,
                "ValuePlus": 240,
                "Cost": 8660,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 25,
                "ValuePlus": 250,
                "Cost": 9250,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 26,
                "ValuePlus": 260,
                "Cost": 9860,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 27,
                "ValuePlus": 270,
                "Cost": 10490,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 28,
                "ValuePlus": 280,
                "Cost": 11140,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 29,
                "ValuePlus": 290,
                "Cost": 11810,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "HP",
                "Level": 30,
                "ValuePlus": 300,
                "Cost": 12500,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 31,
                "ValuePlus": 310,
                "Cost": 13210,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 32,
                "ValuePlus": 320,
                "Cost": 13940,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 33,
                "ValuePlus": 330,
                "Cost": 14690,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 34,
                "ValuePlus": 340,
                "Cost": 15460,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 35,
                "ValuePlus": 350,
                "Cost": 16250,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 36,
                "ValuePlus": 360,
                "Cost": 17060,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 37,
                "ValuePlus": 370,
                "Cost": 17890,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 38,
                "ValuePlus": 380,
                "Cost": 18740,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 39,
                "ValuePlus": 390,
                "Cost": 19610,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "HP",
                "Level": 40,
                "ValuePlus": 400,
                "Cost": 20500,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 41,
                "ValuePlus": 410,
                "Cost": 21410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 42,
                "ValuePlus": 420,
                "Cost": 22340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 43,
                "ValuePlus": 430,
                "Cost": 23290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 44,
                "ValuePlus": 440,
                "Cost": 24260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 45,
                "ValuePlus": 450,
                "Cost": 25250,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 46,
                "ValuePlus": 460,
                "Cost": 26260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 47,
                "ValuePlus": 470,
                "Cost": 27290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 48,
                "ValuePlus": 480,
                "Cost": 28340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 49,
                "ValuePlus": 490,
                "Cost": 29410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "HP",
                "Level": 50,
                "ValuePlus": 500,
                "Cost": 30500,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 51,
                "ValuePlus": 510,
                "Cost": 31610,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 52,
                "ValuePlus": 520,
                "Cost": 32740,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 53,
                "ValuePlus": 530,
                "Cost": 33890,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 54,
                "ValuePlus": 540,
                "Cost": 35060,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 55,
                "ValuePlus": 550,
                "Cost": 36250,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 56,
                "ValuePlus": 560,
                "Cost": 37460,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 57,
                "ValuePlus": 570,
                "Cost": 38690,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 58,
                "ValuePlus": 580,
                "Cost": 39940,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 59,
                "ValuePlus": 590,
                "Cost": 41210,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "HP",
                "Level": 60,
                "ValuePlus": 600,
                "Cost": 42500,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 61,
                "ValuePlus": 610,
                "Cost": 43810,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 62,
                "ValuePlus": 620,
                "Cost": 45140,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 63,
                "ValuePlus": 630,
                "Cost": 46490,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 64,
                "ValuePlus": 640,
                "Cost": 47860,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 65,
                "ValuePlus": 650,
                "Cost": 49250,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 66,
                "ValuePlus": 660,
                "Cost": 50660,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 67,
                "ValuePlus": 670,
                "Cost": 52090,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 68,
                "ValuePlus": 680,
                "Cost": 53540,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 69,
                "ValuePlus": 690,
                "Cost": 55010,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "HP",
                "Level": 70,
                "ValuePlus": 700,
                "Cost": 56500,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 71,
                "ValuePlus": 710,
                "Cost": 58010,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 72,
                "ValuePlus": 720,
                "Cost": 59540,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 73,
                "ValuePlus": 730,
                "Cost": 61090,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 74,
                "ValuePlus": 740,
                "Cost": 62660,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 75,
                "ValuePlus": 750,
                "Cost": 64250,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 76,
                "ValuePlus": 760,
                "Cost": 65860,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 77,
                "ValuePlus": 770,
                "Cost": 67490,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 78,
                "ValuePlus": 780,
                "Cost": 69140,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 79,
                "ValuePlus": 790,
                "Cost": 70810,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "HP",
                "Level": 80,
                "ValuePlus": 800,
                "Cost": 72500,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 81,
                "ValuePlus": 810,
                "Cost": 74210,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 82,
                "ValuePlus": 820,
                "Cost": 75940,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 83,
                "ValuePlus": 830,
                "Cost": 77690,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 84,
                "ValuePlus": 840,
                "Cost": 79460,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 85,
                "ValuePlus": 850,
                "Cost": 81250,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 86,
                "ValuePlus": 860,
                "Cost": 83060,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 87,
                "ValuePlus": 870,
                "Cost": 84890,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 88,
                "ValuePlus": 880,
                "Cost": 86740,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 89,
                "ValuePlus": 890,
                "Cost": 88610,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "HP",
                "Level": 90,
                "ValuePlus": 900,
                "Cost": 90500,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 91,
                "ValuePlus": 910,
                "Cost": 92410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 92,
                "ValuePlus": 920,
                "Cost": 94340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 93,
                "ValuePlus": 930,
                "Cost": 96290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 94,
                "ValuePlus": 940,
                "Cost": 98260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 95,
                "ValuePlus": 950,
                "Cost": 100250,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 96,
                "ValuePlus": 960,
                "Cost": 102260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 97,
                "ValuePlus": 970,
                "Cost": 104290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 98,
                "ValuePlus": 980,
                "Cost": 106340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 99,
                "ValuePlus": 990,
                "Cost": 108410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "HP",
                "Level": 100,
                "ValuePlus": 1000,
                "Cost": 110500,
                "MaterialID": "TypeA",
                "MaterialCount": 13
            }
        ],
        "ENGINE": [
            {
                "StatType": "ENGINE",
                "Level": 0,
                "ValuePlus": 0,
                "Cost": 0,
                "MaterialCount": 0
            },
            {
                "StatType": "ENGINE",
                "Level": 1,
                "ValuePlus": 2,
                "Cost": 610,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 2,
                "ValuePlus": 4,
                "Cost": 740,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 3,
                "ValuePlus": 6,
                "Cost": 890,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 4,
                "ValuePlus": 8,
                "Cost": 1060,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 5,
                "ValuePlus": 10,
                "Cost": 1250,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 6,
                "ValuePlus": 12,
                "Cost": 1460,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 7,
                "ValuePlus": 14,
                "Cost": 1690,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 8,
                "ValuePlus": 16,
                "Cost": 1940,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 9,
                "ValuePlus": 18,
                "Cost": 2210,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ENGINE",
                "Level": 10,
                "ValuePlus": 20,
                "Cost": 2500,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 11,
                "ValuePlus": 22,
                "Cost": 2810,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 12,
                "ValuePlus": 24,
                "Cost": 3140,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 13,
                "ValuePlus": 26,
                "Cost": 3490,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 14,
                "ValuePlus": 28,
                "Cost": 3860,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 15,
                "ValuePlus": 30,
                "Cost": 4250,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 16,
                "ValuePlus": 32,
                "Cost": 4660,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 17,
                "ValuePlus": 34,
                "Cost": 5090,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 18,
                "ValuePlus": 36,
                "Cost": 5540,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 19,
                "ValuePlus": 38,
                "Cost": 6010,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ENGINE",
                "Level": 20,
                "ValuePlus": 40,
                "Cost": 6500,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 21,
                "ValuePlus": 42,
                "Cost": 7010,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 22,
                "ValuePlus": 44,
                "Cost": 7540,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 23,
                "ValuePlus": 46,
                "Cost": 8090,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 24,
                "ValuePlus": 48,
                "Cost": 8660,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 25,
                "ValuePlus": 50,
                "Cost": 9250,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 26,
                "ValuePlus": 52,
                "Cost": 9860,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 27,
                "ValuePlus": 54,
                "Cost": 10490,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 28,
                "ValuePlus": 56,
                "Cost": 11140,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 29,
                "ValuePlus": 58,
                "Cost": 11810,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ENGINE",
                "Level": 30,
                "ValuePlus": 60,
                "Cost": 12500,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 31,
                "ValuePlus": 62,
                "Cost": 13210,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 32,
                "ValuePlus": 64,
                "Cost": 13940,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 33,
                "ValuePlus": 66,
                "Cost": 14690,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 34,
                "ValuePlus": 68,
                "Cost": 15460,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 35,
                "ValuePlus": 70,
                "Cost": 16250,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 36,
                "ValuePlus": 72,
                "Cost": 17060,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 37,
                "ValuePlus": 74,
                "Cost": 17890,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 38,
                "ValuePlus": 76,
                "Cost": 18740,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 39,
                "ValuePlus": 78,
                "Cost": 19610,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ENGINE",
                "Level": 40,
                "ValuePlus": 80,
                "Cost": 20500,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 41,
                "ValuePlus": 82,
                "Cost": 21410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 42,
                "ValuePlus": 84,
                "Cost": 22340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 43,
                "ValuePlus": 86,
                "Cost": 23290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 44,
                "ValuePlus": 88,
                "Cost": 24260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 45,
                "ValuePlus": 90,
                "Cost": 25250,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 46,
                "ValuePlus": 92,
                "Cost": 26260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 47,
                "ValuePlus": 94,
                "Cost": 27290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 48,
                "ValuePlus": 96,
                "Cost": 28340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 49,
                "ValuePlus": 98,
                "Cost": 29410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ENGINE",
                "Level": 50,
                "ValuePlus": 100,
                "Cost": 30500,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 51,
                "ValuePlus": 102,
                "Cost": 31610,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 52,
                "ValuePlus": 104,
                "Cost": 32740,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 53,
                "ValuePlus": 106,
                "Cost": 33890,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 54,
                "ValuePlus": 108,
                "Cost": 35060,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 55,
                "ValuePlus": 110,
                "Cost": 36250,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 56,
                "ValuePlus": 112,
                "Cost": 37460,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 57,
                "ValuePlus": 114,
                "Cost": 38690,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 58,
                "ValuePlus": 116,
                "Cost": 39940,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 59,
                "ValuePlus": 118,
                "Cost": 41210,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ENGINE",
                "Level": 60,
                "ValuePlus": 120,
                "Cost": 42500,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 61,
                "ValuePlus": 122,
                "Cost": 43810,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 62,
                "ValuePlus": 124,
                "Cost": 45140,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 63,
                "ValuePlus": 126,
                "Cost": 46490,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 64,
                "ValuePlus": 128,
                "Cost": 47860,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 65,
                "ValuePlus": 130,
                "Cost": 49250,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 66,
                "ValuePlus": 132,
                "Cost": 50660,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 67,
                "ValuePlus": 134,
                "Cost": 52090,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 68,
                "ValuePlus": 136,
                "Cost": 53540,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 69,
                "ValuePlus": 138,
                "Cost": 55010,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ENGINE",
                "Level": 70,
                "ValuePlus": 140,
                "Cost": 56500,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 71,
                "ValuePlus": 142,
                "Cost": 58010,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 72,
                "ValuePlus": 144,
                "Cost": 59540,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 73,
                "ValuePlus": 146,
                "Cost": 61090,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 74,
                "ValuePlus": 148,
                "Cost": 62660,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 75,
                "ValuePlus": 150,
                "Cost": 64250,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 76,
                "ValuePlus": 152,
                "Cost": 65860,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 77,
                "ValuePlus": 154,
                "Cost": 67490,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 78,
                "ValuePlus": 156,
                "Cost": 69140,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 79,
                "ValuePlus": 158,
                "Cost": 70810,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ENGINE",
                "Level": 80,
                "ValuePlus": 160,
                "Cost": 72500,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 81,
                "ValuePlus": 162,
                "Cost": 74210,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 82,
                "ValuePlus": 164,
                "Cost": 75940,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 83,
                "ValuePlus": 166,
                "Cost": 77690,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 84,
                "ValuePlus": 168,
                "Cost": 79460,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 85,
                "ValuePlus": 170,
                "Cost": 81250,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 86,
                "ValuePlus": 172,
                "Cost": 83060,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 87,
                "ValuePlus": 174,
                "Cost": 84890,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 88,
                "ValuePlus": 176,
                "Cost": 86740,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 89,
                "ValuePlus": 178,
                "Cost": 88610,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ENGINE",
                "Level": 90,
                "ValuePlus": 180,
                "Cost": 90500,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 91,
                "ValuePlus": 182,
                "Cost": 92410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 92,
                "ValuePlus": 184,
                "Cost": 94340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 93,
                "ValuePlus": 186,
                "Cost": 96290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 94,
                "ValuePlus": 188,
                "Cost": 98260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 95,
                "ValuePlus": 190,
                "Cost": 100250,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 96,
                "ValuePlus": 192,
                "Cost": 102260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 97,
                "ValuePlus": 194,
                "Cost": 104290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 98,
                "ValuePlus": 196,
                "Cost": 106340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 99,
                "ValuePlus": 198,
                "Cost": 108410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ENGINE",
                "Level": 100,
                "ValuePlus": 200,
                "Cost": 110500,
                "MaterialID": "TypeA",
                "MaterialCount": 13
            }
        ],
        "ACCEL": [
            {
                "StatType": "ACCEL",
                "Level": 0,
                "ValuePlus": 0,
                "Cost": 0,
                "MaterialCount": 0
            },
            {
                "StatType": "ACCEL",
                "Level": 1,
                "ValuePlus": 1,
                "Cost": 610,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 2,
                "ValuePlus": 2,
                "Cost": 740,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 3,
                "ValuePlus": 3,
                "Cost": 890,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 4,
                "ValuePlus": 4,
                "Cost": 1060,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 5,
                "ValuePlus": 5,
                "Cost": 1250,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 6,
                "ValuePlus": 6,
                "Cost": 1460,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 7,
                "ValuePlus": 7,
                "Cost": 1690,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 8,
                "ValuePlus": 8,
                "Cost": 1940,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 9,
                "ValuePlus": 9,
                "Cost": 2210,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "ACCEL",
                "Level": 10,
                "ValuePlus": 10,
                "Cost": 2500,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 11,
                "ValuePlus": 11,
                "Cost": 2810,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 12,
                "ValuePlus": 12,
                "Cost": 3140,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 13,
                "ValuePlus": 13,
                "Cost": 3490,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 14,
                "ValuePlus": 14,
                "Cost": 3860,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 15,
                "ValuePlus": 15,
                "Cost": 4250,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 16,
                "ValuePlus": 16,
                "Cost": 4660,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 17,
                "ValuePlus": 17,
                "Cost": 5090,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 18,
                "ValuePlus": 18,
                "Cost": 5540,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 19,
                "ValuePlus": 19,
                "Cost": 6010,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "ACCEL",
                "Level": 20,
                "ValuePlus": 20,
                "Cost": 6500,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 21,
                "ValuePlus": 21,
                "Cost": 7010,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 22,
                "ValuePlus": 22,
                "Cost": 7540,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 23,
                "ValuePlus": 23,
                "Cost": 8090,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 24,
                "ValuePlus": 24,
                "Cost": 8660,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 25,
                "ValuePlus": 25,
                "Cost": 9250,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 26,
                "ValuePlus": 26,
                "Cost": 9860,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 27,
                "ValuePlus": 27,
                "Cost": 10490,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 28,
                "ValuePlus": 28,
                "Cost": 11140,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 29,
                "ValuePlus": 29,
                "Cost": 11810,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "ACCEL",
                "Level": 30,
                "ValuePlus": 30,
                "Cost": 12500,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 31,
                "ValuePlus": 31,
                "Cost": 13210,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 32,
                "ValuePlus": 32,
                "Cost": 13940,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 33,
                "ValuePlus": 33,
                "Cost": 14690,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 34,
                "ValuePlus": 34,
                "Cost": 15460,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 35,
                "ValuePlus": 35,
                "Cost": 16250,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 36,
                "ValuePlus": 36,
                "Cost": 17060,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 37,
                "ValuePlus": 37,
                "Cost": 17890,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 38,
                "ValuePlus": 38,
                "Cost": 18740,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 39,
                "ValuePlus": 39,
                "Cost": 19610,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "ACCEL",
                "Level": 40,
                "ValuePlus": 40,
                "Cost": 20500,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 41,
                "ValuePlus": 41,
                "Cost": 21410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 42,
                "ValuePlus": 42,
                "Cost": 22340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 43,
                "ValuePlus": 43,
                "Cost": 23290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 44,
                "ValuePlus": 44,
                "Cost": 24260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 45,
                "ValuePlus": 45,
                "Cost": 25250,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 46,
                "ValuePlus": 46,
                "Cost": 26260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 47,
                "ValuePlus": 47,
                "Cost": 27290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 48,
                "ValuePlus": 48,
                "Cost": 28340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 49,
                "ValuePlus": 49,
                "Cost": 29410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "ACCEL",
                "Level": 50,
                "ValuePlus": 50,
                "Cost": 30500,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 51,
                "ValuePlus": 51,
                "Cost": 31610,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 52,
                "ValuePlus": 52,
                "Cost": 32740,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 53,
                "ValuePlus": 53,
                "Cost": 33890,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 54,
                "ValuePlus": 54,
                "Cost": 35060,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 55,
                "ValuePlus": 55,
                "Cost": 36250,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 56,
                "ValuePlus": 56,
                "Cost": 37460,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 57,
                "ValuePlus": 57,
                "Cost": 38690,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 58,
                "ValuePlus": 58,
                "Cost": 39940,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 59,
                "ValuePlus": 59,
                "Cost": 41210,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "ACCEL",
                "Level": 60,
                "ValuePlus": 60,
                "Cost": 42500,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 61,
                "ValuePlus": 61,
                "Cost": 43810,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 62,
                "ValuePlus": 62,
                "Cost": 45140,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 63,
                "ValuePlus": 63,
                "Cost": 46490,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 64,
                "ValuePlus": 64,
                "Cost": 47860,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 65,
                "ValuePlus": 65,
                "Cost": 49250,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 66,
                "ValuePlus": 66,
                "Cost": 50660,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 67,
                "ValuePlus": 67,
                "Cost": 52090,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 68,
                "ValuePlus": 68,
                "Cost": 53540,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 69,
                "ValuePlus": 69,
                "Cost": 55010,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "ACCEL",
                "Level": 70,
                "ValuePlus": 70,
                "Cost": 56500,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 71,
                "ValuePlus": 71,
                "Cost": 58010,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 72,
                "ValuePlus": 72,
                "Cost": 59540,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 73,
                "ValuePlus": 73,
                "Cost": 61090,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 74,
                "ValuePlus": 74,
                "Cost": 62660,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 75,
                "ValuePlus": 75,
                "Cost": 64250,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 76,
                "ValuePlus": 76,
                "Cost": 65860,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 77,
                "ValuePlus": 77,
                "Cost": 67490,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 78,
                "ValuePlus": 78,
                "Cost": 69140,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 79,
                "ValuePlus": 79,
                "Cost": 70810,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "ACCEL",
                "Level": 80,
                "ValuePlus": 80,
                "Cost": 72500,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 81,
                "ValuePlus": 81,
                "Cost": 74210,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 82,
                "ValuePlus": 82,
                "Cost": 75940,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 83,
                "ValuePlus": 83,
                "Cost": 77690,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 84,
                "ValuePlus": 84,
                "Cost": 79460,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 85,
                "ValuePlus": 85,
                "Cost": 81250,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 86,
                "ValuePlus": 86,
                "Cost": 83060,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 87,
                "ValuePlus": 87,
                "Cost": 84890,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 88,
                "ValuePlus": 88,
                "Cost": 86740,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 89,
                "ValuePlus": 89,
                "Cost": 88610,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "ACCEL",
                "Level": 90,
                "ValuePlus": 90,
                "Cost": 90500,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 91,
                "ValuePlus": 91,
                "Cost": 92410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 92,
                "ValuePlus": 92,
                "Cost": 94340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 93,
                "ValuePlus": 93,
                "Cost": 96290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 94,
                "ValuePlus": 94,
                "Cost": 98260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 95,
                "ValuePlus": 95,
                "Cost": 100250,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 96,
                "ValuePlus": 96,
                "Cost": 102260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 97,
                "ValuePlus": 97,
                "Cost": 104290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 98,
                "ValuePlus": 98,
                "Cost": 106340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 99,
                "ValuePlus": 99,
                "Cost": 108410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "ACCEL",
                "Level": 100,
                "ValuePlus": 100,
                "Cost": 110500,
                "MaterialID": "TypeA",
                "MaterialCount": 13
            }
        ],
        "SPEED": [
            {
                "StatType": "SPEED",
                "Level": 0,
                "ValuePlus": 0,
                "Cost": 0,
                "MaterialCount": 0
            },
            {
                "StatType": "SPEED",
                "Level": 1,
                "ValuePlus": 5,
                "Cost": 610,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 2,
                "ValuePlus": 10,
                "Cost": 740,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 3,
                "ValuePlus": 15,
                "Cost": 890,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 4,
                "ValuePlus": 20,
                "Cost": 1060,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 5,
                "ValuePlus": 25,
                "Cost": 1250,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 6,
                "ValuePlus": 30,
                "Cost": 1460,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 7,
                "ValuePlus": 35,
                "Cost": 1690,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 8,
                "ValuePlus": 40,
                "Cost": 1940,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 9,
                "ValuePlus": 45,
                "Cost": 2210,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "SPEED",
                "Level": 10,
                "ValuePlus": 50,
                "Cost": 2500,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 11,
                "ValuePlus": 55,
                "Cost": 2810,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 12,
                "ValuePlus": 60,
                "Cost": 3140,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 13,
                "ValuePlus": 65,
                "Cost": 3490,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 14,
                "ValuePlus": 70,
                "Cost": 3860,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 15,
                "ValuePlus": 75,
                "Cost": 4250,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 16,
                "ValuePlus": 80,
                "Cost": 4660,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 17,
                "ValuePlus": 85,
                "Cost": 5090,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 18,
                "ValuePlus": 90,
                "Cost": 5540,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 19,
                "ValuePlus": 95,
                "Cost": 6010,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "SPEED",
                "Level": 20,
                "ValuePlus": 100,
                "Cost": 6500,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 21,
                "ValuePlus": 105,
                "Cost": 7010,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 22,
                "ValuePlus": 110,
                "Cost": 7540,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 23,
                "ValuePlus": 115,
                "Cost": 8090,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 24,
                "ValuePlus": 120,
                "Cost": 8660,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 25,
                "ValuePlus": 125,
                "Cost": 9250,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 26,
                "ValuePlus": 130,
                "Cost": 9860,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 27,
                "ValuePlus": 135,
                "Cost": 10490,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 28,
                "ValuePlus": 140,
                "Cost": 11140,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 29,
                "ValuePlus": 145,
                "Cost": 11810,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "SPEED",
                "Level": 30,
                "ValuePlus": 150,
                "Cost": 12500,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 31,
                "ValuePlus": 155,
                "Cost": 13210,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 32,
                "ValuePlus": 160,
                "Cost": 13940,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 33,
                "ValuePlus": 165,
                "Cost": 14690,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 34,
                "ValuePlus": 170,
                "Cost": 15460,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 35,
                "ValuePlus": 175,
                "Cost": 16250,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 36,
                "ValuePlus": 180,
                "Cost": 17060,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 37,
                "ValuePlus": 185,
                "Cost": 17890,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 38,
                "ValuePlus": 190,
                "Cost": 18740,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 39,
                "ValuePlus": 195,
                "Cost": 19610,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "SPEED",
                "Level": 40,
                "ValuePlus": 200,
                "Cost": 20500,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 41,
                "ValuePlus": 205,
                "Cost": 21410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 42,
                "ValuePlus": 210,
                "Cost": 22340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 43,
                "ValuePlus": 215,
                "Cost": 23290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 44,
                "ValuePlus": 220,
                "Cost": 24260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 45,
                "ValuePlus": 225,
                "Cost": 25250,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 46,
                "ValuePlus": 230,
                "Cost": 26260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 47,
                "ValuePlus": 235,
                "Cost": 27290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 48,
                "ValuePlus": 240,
                "Cost": 28340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 49,
                "ValuePlus": 245,
                "Cost": 29410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "SPEED",
                "Level": 50,
                "ValuePlus": 250,
                "Cost": 30500,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 51,
                "ValuePlus": 255,
                "Cost": 31610,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 52,
                "ValuePlus": 260,
                "Cost": 32740,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 53,
                "ValuePlus": 265,
                "Cost": 33890,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 54,
                "ValuePlus": 270,
                "Cost": 35060,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 55,
                "ValuePlus": 275,
                "Cost": 36250,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 56,
                "ValuePlus": 280,
                "Cost": 37460,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 57,
                "ValuePlus": 285,
                "Cost": 38690,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 58,
                "ValuePlus": 290,
                "Cost": 39940,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 59,
                "ValuePlus": 295,
                "Cost": 41210,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "SPEED",
                "Level": 60,
                "ValuePlus": 300,
                "Cost": 42500,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 61,
                "ValuePlus": 305,
                "Cost": 43810,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 62,
                "ValuePlus": 310,
                "Cost": 45140,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 63,
                "ValuePlus": 315,
                "Cost": 46490,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 64,
                "ValuePlus": 320,
                "Cost": 47860,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 65,
                "ValuePlus": 325,
                "Cost": 49250,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 66,
                "ValuePlus": 330,
                "Cost": 50660,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 67,
                "ValuePlus": 335,
                "Cost": 52090,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 68,
                "ValuePlus": 340,
                "Cost": 53540,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 69,
                "ValuePlus": 345,
                "Cost": 55010,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "SPEED",
                "Level": 70,
                "ValuePlus": 350,
                "Cost": 56500,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 71,
                "ValuePlus": 355,
                "Cost": 58010,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 72,
                "ValuePlus": 360,
                "Cost": 59540,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 73,
                "ValuePlus": 365,
                "Cost": 61090,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 74,
                "ValuePlus": 370,
                "Cost": 62660,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 75,
                "ValuePlus": 375,
                "Cost": 64250,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 76,
                "ValuePlus": 380,
                "Cost": 65860,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 77,
                "ValuePlus": 385,
                "Cost": 67490,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 78,
                "ValuePlus": 390,
                "Cost": 69140,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 79,
                "ValuePlus": 395,
                "Cost": 70810,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "SPEED",
                "Level": 80,
                "ValuePlus": 400,
                "Cost": 72500,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 81,
                "ValuePlus": 405,
                "Cost": 74210,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 82,
                "ValuePlus": 410,
                "Cost": 75940,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 83,
                "ValuePlus": 415,
                "Cost": 77690,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 84,
                "ValuePlus": 420,
                "Cost": 79460,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 85,
                "ValuePlus": 425,
                "Cost": 81250,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 86,
                "ValuePlus": 430,
                "Cost": 83060,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 87,
                "ValuePlus": 435,
                "Cost": 84890,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 88,
                "ValuePlus": 440,
                "Cost": 86740,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 89,
                "ValuePlus": 445,
                "Cost": 88610,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "SPEED",
                "Level": 90,
                "ValuePlus": 450,
                "Cost": 90500,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 91,
                "ValuePlus": 455,
                "Cost": 92410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 92,
                "ValuePlus": 460,
                "Cost": 94340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 93,
                "ValuePlus": 465,
                "Cost": 96290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 94,
                "ValuePlus": 470,
                "Cost": 98260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 95,
                "ValuePlus": 475,
                "Cost": 100250,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 96,
                "ValuePlus": 480,
                "Cost": 102260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 97,
                "ValuePlus": 485,
                "Cost": 104290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 98,
                "ValuePlus": 490,
                "Cost": 106340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 99,
                "ValuePlus": 495,
                "Cost": 108410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "SPEED",
                "Level": 100,
                "ValuePlus": 500,
                "Cost": 110500,
                "MaterialID": "TypeA",
                "MaterialCount": 13
            }
        ],
        "BRAKE": [
            {
                "StatType": "BRAKE",
                "Level": 0,
                "ValuePlus": 0,
                "Cost": 0,
                "MaterialCount": 0
            },
            {
                "StatType": "BRAKE",
                "Level": 1,
                "ValuePlus": 1,
                "Cost": 610,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 2,
                "ValuePlus": 2,
                "Cost": 740,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 3,
                "ValuePlus": 3,
                "Cost": 890,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 4,
                "ValuePlus": 4,
                "Cost": 1060,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 5,
                "ValuePlus": 5,
                "Cost": 1250,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 6,
                "ValuePlus": 6,
                "Cost": 1460,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 7,
                "ValuePlus": 7,
                "Cost": 1690,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 8,
                "ValuePlus": 8,
                "Cost": 1940,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 9,
                "ValuePlus": 9,
                "Cost": 2210,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "BRAKE",
                "Level": 10,
                "ValuePlus": 10,
                "Cost": 2500,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 11,
                "ValuePlus": 11,
                "Cost": 2810,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 12,
                "ValuePlus": 12,
                "Cost": 3140,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 13,
                "ValuePlus": 13,
                "Cost": 3490,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 14,
                "ValuePlus": 14,
                "Cost": 3860,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 15,
                "ValuePlus": 15,
                "Cost": 4250,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 16,
                "ValuePlus": 16,
                "Cost": 4660,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 17,
                "ValuePlus": 17,
                "Cost": 5090,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 18,
                "ValuePlus": 18,
                "Cost": 5540,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 19,
                "ValuePlus": 19,
                "Cost": 6010,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "BRAKE",
                "Level": 20,
                "ValuePlus": 20,
                "Cost": 6500,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 21,
                "ValuePlus": 21,
                "Cost": 7010,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 22,
                "ValuePlus": 22,
                "Cost": 7540,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 23,
                "ValuePlus": 23,
                "Cost": 8090,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 24,
                "ValuePlus": 24,
                "Cost": 8660,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 25,
                "ValuePlus": 25,
                "Cost": 9250,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 26,
                "ValuePlus": 26,
                "Cost": 9860,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 27,
                "ValuePlus": 27,
                "Cost": 10490,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 28,
                "ValuePlus": 28,
                "Cost": 11140,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 29,
                "ValuePlus": 29,
                "Cost": 11810,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "BRAKE",
                "Level": 30,
                "ValuePlus": 30,
                "Cost": 12500,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 31,
                "ValuePlus": 31,
                "Cost": 13210,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 32,
                "ValuePlus": 32,
                "Cost": 13940,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 33,
                "ValuePlus": 33,
                "Cost": 14690,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 34,
                "ValuePlus": 34,
                "Cost": 15460,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 35,
                "ValuePlus": 35,
                "Cost": 16250,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 36,
                "ValuePlus": 36,
                "Cost": 17060,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 37,
                "ValuePlus": 37,
                "Cost": 17890,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 38,
                "ValuePlus": 38,
                "Cost": 18740,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 39,
                "ValuePlus": 39,
                "Cost": 19610,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "BRAKE",
                "Level": 40,
                "ValuePlus": 40,
                "Cost": 20500,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 41,
                "ValuePlus": 41,
                "Cost": 21410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 42,
                "ValuePlus": 42,
                "Cost": 22340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 43,
                "ValuePlus": 43,
                "Cost": 23290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 44,
                "ValuePlus": 44,
                "Cost": 24260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 45,
                "ValuePlus": 45,
                "Cost": 25250,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 46,
                "ValuePlus": 46,
                "Cost": 26260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 47,
                "ValuePlus": 47,
                "Cost": 27290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 48,
                "ValuePlus": 48,
                "Cost": 28340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 49,
                "ValuePlus": 49,
                "Cost": 29410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "BRAKE",
                "Level": 50,
                "ValuePlus": 50,
                "Cost": 30500,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 51,
                "ValuePlus": 51,
                "Cost": 31610,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 52,
                "ValuePlus": 52,
                "Cost": 32740,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 53,
                "ValuePlus": 53,
                "Cost": 33890,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 54,
                "ValuePlus": 54,
                "Cost": 35060,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 55,
                "ValuePlus": 55,
                "Cost": 36250,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 56,
                "ValuePlus": 56,
                "Cost": 37460,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 57,
                "ValuePlus": 57,
                "Cost": 38690,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 58,
                "ValuePlus": 58,
                "Cost": 39940,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 59,
                "ValuePlus": 59,
                "Cost": 41210,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "BRAKE",
                "Level": 60,
                "ValuePlus": 60,
                "Cost": 42500,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 61,
                "ValuePlus": 61,
                "Cost": 43810,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 62,
                "ValuePlus": 62,
                "Cost": 45140,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 63,
                "ValuePlus": 63,
                "Cost": 46490,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 64,
                "ValuePlus": 64,
                "Cost": 47860,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 65,
                "ValuePlus": 65,
                "Cost": 49250,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 66,
                "ValuePlus": 66,
                "Cost": 50660,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 67,
                "ValuePlus": 67,
                "Cost": 52090,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 68,
                "ValuePlus": 68,
                "Cost": 53540,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 69,
                "ValuePlus": 69,
                "Cost": 55010,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "BRAKE",
                "Level": 70,
                "ValuePlus": 70,
                "Cost": 56500,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 71,
                "ValuePlus": 71,
                "Cost": 58010,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 72,
                "ValuePlus": 72,
                "Cost": 59540,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 73,
                "ValuePlus": 73,
                "Cost": 61090,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 74,
                "ValuePlus": 74,
                "Cost": 62660,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 75,
                "ValuePlus": 75,
                "Cost": 64250,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 76,
                "ValuePlus": 76,
                "Cost": 65860,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 77,
                "ValuePlus": 77,
                "Cost": 67490,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 78,
                "ValuePlus": 78,
                "Cost": 69140,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 79,
                "ValuePlus": 79,
                "Cost": 70810,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "BRAKE",
                "Level": 80,
                "ValuePlus": 80,
                "Cost": 72500,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 81,
                "ValuePlus": 81,
                "Cost": 74210,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 82,
                "ValuePlus": 82,
                "Cost": 75940,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 83,
                "ValuePlus": 83,
                "Cost": 77690,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 84,
                "ValuePlus": 84,
                "Cost": 79460,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 85,
                "ValuePlus": 85,
                "Cost": 81250,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 86,
                "ValuePlus": 86,
                "Cost": 83060,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 87,
                "ValuePlus": 87,
                "Cost": 84890,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 88,
                "ValuePlus": 88,
                "Cost": 86740,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 89,
                "ValuePlus": 89,
                "Cost": 88610,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "BRAKE",
                "Level": 90,
                "ValuePlus": 90,
                "Cost": 90500,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 91,
                "ValuePlus": 91,
                "Cost": 92410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 92,
                "ValuePlus": 92,
                "Cost": 94340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 93,
                "ValuePlus": 93,
                "Cost": 96290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 94,
                "ValuePlus": 94,
                "Cost": 98260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 95,
                "ValuePlus": 95,
                "Cost": 100250,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 96,
                "ValuePlus": 96,
                "Cost": 102260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 97,
                "ValuePlus": 97,
                "Cost": 104290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 98,
                "ValuePlus": 98,
                "Cost": 106340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 99,
                "ValuePlus": 99,
                "Cost": 108410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "BRAKE",
                "Level": 100,
                "ValuePlus": 100,
                "Cost": 110500,
                "MaterialID": "TypeA",
                "MaterialCount": 13
            }
        ],
        "WEAPON_OS": [
            {
                "StatType": "WEAPON_OS",
                "Level": 0,
                "ValuePlus": 0,
                "Cost": 0,
                "MaterialCount": 0
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 1,
                "ValuePlus": 1,
                "Cost": 610,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 2,
                "ValuePlus": 2,
                "Cost": 740,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 3,
                "ValuePlus": 3,
                "Cost": 890,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 4,
                "ValuePlus": 4,
                "Cost": 1060,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 5,
                "ValuePlus": 5,
                "Cost": 1250,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 6,
                "ValuePlus": 6,
                "Cost": 1460,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 7,
                "ValuePlus": 7,
                "Cost": 1690,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 8,
                "ValuePlus": 8,
                "Cost": 1940,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 9,
                "ValuePlus": 9,
                "Cost": 2210,
                "MaterialID": "TypeA",
                "MaterialCount": 3
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 10,
                "ValuePlus": 10,
                "Cost": 2500,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 11,
                "ValuePlus": 11,
                "Cost": 2810,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 12,
                "ValuePlus": 12,
                "Cost": 3140,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 13,
                "ValuePlus": 13,
                "Cost": 3490,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 14,
                "ValuePlus": 14,
                "Cost": 3860,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 15,
                "ValuePlus": 15,
                "Cost": 4250,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 16,
                "ValuePlus": 16,
                "Cost": 4660,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 17,
                "ValuePlus": 17,
                "Cost": 5090,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 18,
                "ValuePlus": 18,
                "Cost": 5540,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 19,
                "ValuePlus": 19,
                "Cost": 6010,
                "MaterialID": "TypeA",
                "MaterialCount": 4
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 20,
                "ValuePlus": 20,
                "Cost": 6500,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 21,
                "ValuePlus": 21,
                "Cost": 7010,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 22,
                "ValuePlus": 22,
                "Cost": 7540,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 23,
                "ValuePlus": 23,
                "Cost": 8090,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 24,
                "ValuePlus": 24,
                "Cost": 8660,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 25,
                "ValuePlus": 25,
                "Cost": 9250,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 26,
                "ValuePlus": 26,
                "Cost": 9860,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 27,
                "ValuePlus": 27,
                "Cost": 10490,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 28,
                "ValuePlus": 28,
                "Cost": 11140,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 29,
                "ValuePlus": 29,
                "Cost": 11810,
                "MaterialID": "TypeA",
                "MaterialCount": 5
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 30,
                "ValuePlus": 30,
                "Cost": 12500,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 31,
                "ValuePlus": 31,
                "Cost": 13210,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 32,
                "ValuePlus": 32,
                "Cost": 13940,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 33,
                "ValuePlus": 33,
                "Cost": 14690,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 34,
                "ValuePlus": 34,
                "Cost": 15460,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 35,
                "ValuePlus": 35,
                "Cost": 16250,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 36,
                "ValuePlus": 36,
                "Cost": 17060,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 37,
                "ValuePlus": 37,
                "Cost": 17890,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 38,
                "ValuePlus": 38,
                "Cost": 18740,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 39,
                "ValuePlus": 39,
                "Cost": 19610,
                "MaterialID": "TypeA",
                "MaterialCount": 6
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 40,
                "ValuePlus": 40,
                "Cost": 20500,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 41,
                "ValuePlus": 41,
                "Cost": 21410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 42,
                "ValuePlus": 42,
                "Cost": 22340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 43,
                "ValuePlus": 43,
                "Cost": 23290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 44,
                "ValuePlus": 44,
                "Cost": 24260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 45,
                "ValuePlus": 45,
                "Cost": 25250,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 46,
                "ValuePlus": 46,
                "Cost": 26260,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 47,
                "ValuePlus": 47,
                "Cost": 27290,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 48,
                "ValuePlus": 48,
                "Cost": 28340,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 49,
                "ValuePlus": 49,
                "Cost": 29410,
                "MaterialID": "TypeA",
                "MaterialCount": 7
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 50,
                "ValuePlus": 50,
                "Cost": 30500,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 51,
                "ValuePlus": 51,
                "Cost": 31610,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 52,
                "ValuePlus": 52,
                "Cost": 32740,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 53,
                "ValuePlus": 53,
                "Cost": 33890,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 54,
                "ValuePlus": 54,
                "Cost": 35060,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 55,
                "ValuePlus": 55,
                "Cost": 36250,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 56,
                "ValuePlus": 56,
                "Cost": 37460,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 57,
                "ValuePlus": 57,
                "Cost": 38690,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 58,
                "ValuePlus": 58,
                "Cost": 39940,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 59,
                "ValuePlus": 59,
                "Cost": 41210,
                "MaterialID": "TypeA",
                "MaterialCount": 8
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 60,
                "ValuePlus": 60,
                "Cost": 42500,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 61,
                "ValuePlus": 61,
                "Cost": 43810,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 62,
                "ValuePlus": 62,
                "Cost": 45140,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 63,
                "ValuePlus": 63,
                "Cost": 46490,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 64,
                "ValuePlus": 64,
                "Cost": 47860,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 65,
                "ValuePlus": 65,
                "Cost": 49250,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 66,
                "ValuePlus": 66,
                "Cost": 50660,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 67,
                "ValuePlus": 67,
                "Cost": 52090,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 68,
                "ValuePlus": 68,
                "Cost": 53540,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 69,
                "ValuePlus": 69,
                "Cost": 55010,
                "MaterialID": "TypeA",
                "MaterialCount": 9
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 70,
                "ValuePlus": 70,
                "Cost": 56500,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 71,
                "ValuePlus": 71,
                "Cost": 58010,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 72,
                "ValuePlus": 72,
                "Cost": 59540,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 73,
                "ValuePlus": 73,
                "Cost": 61090,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 74,
                "ValuePlus": 74,
                "Cost": 62660,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 75,
                "ValuePlus": 75,
                "Cost": 64250,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 76,
                "ValuePlus": 76,
                "Cost": 65860,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 77,
                "ValuePlus": 77,
                "Cost": 67490,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 78,
                "ValuePlus": 78,
                "Cost": 69140,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 79,
                "ValuePlus": 79,
                "Cost": 70810,
                "MaterialID": "TypeA",
                "MaterialCount": 10
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 80,
                "ValuePlus": 80,
                "Cost": 72500,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 81,
                "ValuePlus": 81,
                "Cost": 74210,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 82,
                "ValuePlus": 82,
                "Cost": 75940,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 83,
                "ValuePlus": 83,
                "Cost": 77690,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 84,
                "ValuePlus": 84,
                "Cost": 79460,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 85,
                "ValuePlus": 85,
                "Cost": 81250,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 86,
                "ValuePlus": 86,
                "Cost": 83060,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 87,
                "ValuePlus": 87,
                "Cost": 84890,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 88,
                "ValuePlus": 88,
                "Cost": 86740,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 89,
                "ValuePlus": 89,
                "Cost": 88610,
                "MaterialID": "TypeA",
                "MaterialCount": 11
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 90,
                "ValuePlus": 90,
                "Cost": 90500,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 91,
                "ValuePlus": 91,
                "Cost": 92410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 92,
                "ValuePlus": 92,
                "Cost": 94340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 93,
                "ValuePlus": 93,
                "Cost": 96290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 94,
                "ValuePlus": 94,
                "Cost": 98260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 95,
                "ValuePlus": 95,
                "Cost": 100250,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 96,
                "ValuePlus": 96,
                "Cost": 102260,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 97,
                "ValuePlus": 97,
                "Cost": 104290,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 98,
                "ValuePlus": 98,
                "Cost": 106340,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 99,
                "ValuePlus": 99,
                "Cost": 108410,
                "MaterialID": "TypeA",
                "MaterialCount": 12
            },
            {
                "StatType": "WEAPON_OS",
                "Level": 100,
                "ValuePlus": 100,
                "Cost": 110500,
                "MaterialID": "TypeA",
                "MaterialCount": 13
            }
        ]
    },
    "WEATHER": {
        "CLEAR": {
            "Key": "CLEAR",
            "Name": "快晴",
            "WindX": 0,
            "WindY": 0,
            "Rain": 0.0
        },
        "RAIN": {
            "Key": "RAIN",
            "Name": "雨",
            "WindX": -1,
            "WindY": 0,
            "Rain": 0.3
        },
        "SQUALL": {
            "Key": "SQUALL",
            "Name": "スコール",
            "WindX": -3,
            "WindY": 1,
            "Rain": 0.8
        },
        "HELL": {
            "Key": "HELL",
            "Name": "地獄",
            "WindX": -5,
            "WindY": 5,
            "Rain": 1.0
        }
    },
    "STAGES": [
        {
            "StageLevel": 1,
            "EnemyMult": 1.0,
            "Distance": 300,
            "Cargo": 30
        },
        {
            "StageLevel": 2,
            "EnemyMult": 1.2,
            "Distance": 600,
            "Cargo": 60
        },
        {
            "StageLevel": 3,
            "EnemyMult": 1.4,
            "Distance": 900,
            "Cargo": 90
        },
        {
            "StageLevel": 4,
            "EnemyMult": 1.6,
            "Distance": 1200,
            "Cargo": 120
        },
        {
            "StageLevel": 5,
            "EnemyMult": 1.8,
            "Distance": 1500,
            "Cargo": 150
        },
        {
            "StageLevel": 6,
            "EnemyMult": 2.0,
            "Distance": 1800,
            "Cargo": 180
        },
        {
            "StageLevel": 7,
            "EnemyMult": 2.2,
            "Distance": 2100,
            "Cargo": 210
        },
        {
            "StageLevel": 8,
            "EnemyMult": 2.4,
            "Distance": 2400,
            "Cargo": 240
        },
        {
            "StageLevel": 9,
            "EnemyMult": 2.6,
            "Distance": 2700,
            "Cargo": 270
        },
        {
            "StageLevel": 10,
            "EnemyMult": 2.8,
            "Distance": 3000,
            "Cargo": 300
        },
        {
            "StageLevel": 11,
            "EnemyMult": 3.0,
            "Distance": 3300,
            "Cargo": 330
        }
    ],
    "MISSION_DATA": {
        "DIFFICULTY_SCALING": [
            {
                "minStat": 0,
                "probs": {
                    "1": 80,
                    "2": 20,
                    "3": 0,
                    "4": 0,
                    "5": 0
                }
            },
            {
                "minStat": 10,
                "probs": {
                    "1": 50,
                    "2": 40,
                    "3": 10,
                    "4": 0,
                    "5": 0
                }
            },
            {
                "minStat": 30,
                "probs": {
                    "1": 30,
                    "2": 40,
                    "3": 30,
                    "4": 0,
                    "5": 0
                }
            },
            {
                "minStat": 60,
                "probs": {
                    "1": 10,
                    "2": 30,
                    "3": 40,
                    "4": 20,
                    "5": 0
                }
            },
            {
                "minStat": 100,
                "probs": {
                    "1": 0,
                    "2": 20,
                    "3": 30,
                    "4": 40,
                    "5": 10
                }
            }
        ],
        "DIFFICULTY_PARAMS": {
            "1": {
                "dist": [
                    200,
                    400
                ],
                "rewardMod": 1.0,
                "weatherTable": "EASY",
                "enemyTier": "Tier1"
            },
            "2": {
                "dist": [
                    400,
                    800
                ],
                "rewardMod": 1.5,
                "weatherTable": "NORMAL",
                "enemyTier": "Tier1"
            },
            "3": {
                "dist": [
                    800,
                    1500
                ],
                "rewardMod": 2.5,
                "weatherTable": "NORMAL",
                "enemyTier": "Tier2"
            },
            "4": {
                "dist": [
                    1500,
                    2500
                ],
                "rewardMod": 4.0,
                "weatherTable": "HARD",
                "enemyTier": "Tier2"
            },
            "5": {
                "dist": [
                    2500,
                    4000
                ],
                "rewardMod": 6.0,
                "weatherTable": "HARD",
                "enemyTier": "Tier3"
            }
        },
        "WEATHER_TABLES": {
            "EASY": {
                "CLEAR": 70,
                "RAIN": 10,
                "SQUALL": 0,
                "HELL": 0
            },
            "NORMAL": {
                "CLEAR": 40,
                "RAIN": 20,
                "SQUALL": 0,
                "HELL": 0
            },
            "HARD": {
                "CLEAR": 20,
                "RAIN": 30,
                "SQUALL": 0,
                "HELL": 0
            }
        }
    }
};
