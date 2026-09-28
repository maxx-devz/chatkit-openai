import unittest

from client_library import LibraryError, clean_date, clean_text, clean_url


class ClientLibraryValidationTests(unittest.TestCase):
    def test_dates_and_text_are_bounded(self):
        self.assertEqual(clean_date("2026-09-28", "Date").isoformat(), "2026-09-28")
        self.assertIsNone(clean_date("", "Date"))
        with self.assertRaises(LibraryError):
            clean_date("09/28/2026", "Date")
        with self.assertRaises(LibraryError):
            clean_text("bad\x00value", 100, "Title")

    def test_only_safe_https_reference_urls_are_saved(self):
        self.assertEqual(clean_url("https://docs.example.com/report#page=2"), "https://docs.example.com/report")
        for value in ("http://example.com", "javascript:alert(1)", "https://user:pass@example.com"):
            with self.assertRaises(LibraryError):
                clean_url(value)


if __name__ == "__main__":
    unittest.main()
