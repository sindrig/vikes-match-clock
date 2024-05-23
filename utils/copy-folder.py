import firebase_admin
import typer
from firebase_admin import credentials, storage
from google.cloud.storage import Blob

"""
python utils/copy-folder.py images fotbolti service-account-key.json
python utils/copy-folder.py largeAds fotbolti service-account-key.json
python utils/copy-folder.py smallAds fotbolti service-account-key.json
python utils/copy-folder.py players fotbolti service-account-key.json
"""


def main(from_folder: str, to_folder: str, service_account_key: str):
    cred = credentials.Certificate(service_account_key)
    firebase_admin.initialize_app(
        cred, {"storageBucket": "vikes-match-clock-staging.appspot.com"}
    )

    bucket = storage.bucket()
    for blob in bucket.list_blobs(prefix=f"{from_folder}/"):
        Blob(bucket=bucket, name=f"{to_folder}/{blob.name}").rewrite(source=blob)


if __name__ == "__main__":
    typer.run(main)
