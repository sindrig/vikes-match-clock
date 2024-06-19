import firebase_admin
import typer
from firebase_admin import credentials, storage
from google.cloud.storage import Blob

"""
python utils/copy-folder.py images fotbolti service-account-key-prod.json
python utils/copy-folder.py largeAds fotbolti service-account-key-prod.json
python utils/copy-folder.py smallAds fotbolti service-account-key-prod.json
python utils/copy-folder.py players fotbolti service-account-key-prod.json
"""


def main(from_folder: str, to_folder: str, service_account_key: str):
    if "staging" in service_account_key:
        bucket = "vikes-match-clock-staging.appspot.com"
    else:
        bucket = "vikes-match-clock-firebase.appspot.com"
    cred = credentials.Certificate(service_account_key)
    firebase_admin.initialize_app(cred, {"storageBucket": bucket})

    bucket = storage.bucket()
    for blob in bucket.list_blobs(prefix=f"{from_folder}/"):
        new_path = blob.name.replace(f"{from_folder}/", "")
        Blob(bucket=bucket, name=f"{to_folder}/{new_path}").rewrite(source=blob)


if __name__ == "__main__":
    typer.run(main)
