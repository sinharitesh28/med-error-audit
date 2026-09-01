import os
import pymysql
from dotenv import load_dotenv

# Load environment variables from the root .env file, overriding any system vars
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../.env'))
load_dotenv(dotenv_path=env_path, override=True)

def get_db_connection():
    timeout = 10
    # Resolve the absolute path to ca.pem relative to this file
    ca_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../', os.getenv("DB_SSL_CA", "ca.pem")))

    connection = pymysql.connect(
        charset="utf8mb4",
        connect_timeout=timeout,
        cursorclass=pymysql.cursors.DictCursor,
        database=os.getenv("DB_NAME", "defaultdb"),
        host=os.getenv("DB_HOST"),
        password=os.getenv("DB_PASSWORD"),
        read_timeout=timeout,
        port=int(os.getenv("DB_PORT", 22597)),
        user=os.getenv("DB_USER"),
        write_timeout=timeout,
        ssl={'ca': ca_path},
        autocommit=True
    )
    return connection
