"""In-memory Supabase Storage fake for backend API tests."""


class FakeStorage:
    def __init__(self):
        self.objects = {}
        self.failures = {}

    def fail(self, operation, error=None):
        self.failures[operation] = error or RuntimeError(
            f"Simulated Storage {operation} failure."
        )

    def clear_failure(self, operation):
        self.failures.pop(operation, None)

    def _raise_failure(self, operation):
        error = self.failures.get(operation)
        if error is not None:
            raise error

    def upload_file(self, bucket, object_key, file_bytes, content_type):
        self._raise_failure("upload")
        self.objects[(bucket, object_key)] = bytes(file_bytes)

    def download_file(self, bucket, object_key):
        self._raise_failure("download")
        try:
            return self.objects[(bucket, object_key)]
        except KeyError as error:
            raise FileNotFoundError(object_key) from error

    def delete_file(self, bucket, object_key):
        self._raise_failure("delete")
        self.objects.pop((bucket, object_key), None)
