import os

path = "d:/ITANHTMl/cocos_project/assets/Excels/Sounds.csv"
if os.path.exists(path):
    with open(path, 'rb') as f:
        data = f.read(200) # Read first 200 bytes
        print("Binary Content (Hex):")
        print(data.hex(' '))
        print("\nPlain text (Repr):")
        print(repr(data.decode('utf-8', errors='ignore')))
else:
    print("File not found.")
