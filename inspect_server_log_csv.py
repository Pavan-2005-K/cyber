
import pandas as pd
from pathlib import Path

# Change this to your actual CSV file path
CSV_PATH = Path(r"C:\path\to\your\server_log_dataset.csv")

if not CSV_PATH.exists():
    print("CSV file not found:", CSV_PATH)
else:
    df = pd.read_csv(CSV_PATH)

    print("DATASET SHAPE:", df.shape)

    print("\nCOLUMN NAMES:")
    print(df.columns.tolist())

    print("\nFIRST 5 ROWS:")
    print(df.head().to_string())

    print("\nDATA TYPES:")
    print(df.dtypes)

    print("\nMISSING VALUES:")
    print(df.isnull().sum())
