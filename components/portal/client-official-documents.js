"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

import DocumentPreview from "../documents/document-preview";
import { documentPreviewAddress } from "@/lib/document-preview-policy";
import { documentOpenLabel } from "@/lib/document-open-label";

import s from "./client-official-documents.module.css";

/**
 * Displays one document, its actions, and its optional preview.
 */
function ClientDocument({ item }) {
  const [open, setOpen] = useState(false);

  const previewItem = {
    ...item,
    kind: "upload",
    url: item.viewUrl,
  };

  const canPreview = Boolean(
    item.previewKind && documentPreviewAddress(previewItem)
  );

  return (
    <li className={s.documentCard}>
      <div className={s.documentRow}>
        <div className={s.fileDetails}>
          <strong>{item.title}</strong>

          {item.description && (
            <p className={s.description}>{item.description}</p>
          )}

          <small>
            Shared{" "}
            {new Date(item.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </small>
        </div>

        <div className={s.actions}>
          {canPreview && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Hide preview" : "Preview"}
            </button>
          )}

          {item.canView && (
            <a href={item.viewUrl} target="_blank" rel="noreferrer">
              {item.viewLabel ||
                documentOpenLabel({
                  delivery: item.delivery,
                  mimeType: item.mimeType,
                  filename: item.title,
                })}
            </a>
          )}

          {item.downloadUrl && (
            <a href={item.downloadUrl}>Download</a>
          )}
        </div>
      </div>

      {canPreview && open && (
        <DocumentPreview item={previewItem} smallerImage />
      )}
    </li>
  );
}

/**
 * Remounts the library when the selected client changes.
 * This prevents one client's document state from being reused for another.
 */
export default function ClientOfficialDocuments(props) {
  return (
    <ScopedClientDocuments
      key={String(props.clientId)}
      {...props}
    />
  );
}

/**
 * Loads and displays documents for the current client.
 */
function ScopedClientDocuments({
  clientId,
  summary = false,
  initialResult,
}) {
  // Only accept initial results belonging to this client.
  const scopedInitial =
    initialResult?.clientId === String(clientId)
      ? initialResult
      : null;

  const initialData = Array.isArray(scopedInitial?.data?.items)
    ? scopedInitial.data
    : null;

  const initialError =
    typeof scopedInitial?.error === "string"
      ? scopedInitial.error
      : "";

  const skipInitialLoad = useRef(
    Boolean(initialData || initialError)
  );

  // Document loading state.
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [reload, setReload] = useState(0);

  // Search input and submitted search/page state.
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({
    search: "",
    page: 0,
  });

  const inputId = useId();

  useEffect(() => {
    let request = 0;
    let active = null;
    let activeTimer = null;
    let disposed = false;

    async function load() {
      if (disposed || (active && !active.signal.aborted)) {
        return;
      }

      const sequence = ++request;

      active?.abort();
      window.clearTimeout(activeTimer);

      const controller = new AbortController();

      active = controller;
      setError("");

      // Bound the full response, including its body.
      // A stalled request must not leave the library loading forever.
      const deadline = window.setTimeout(() => {
        controller.abort();

        if (!disposed && sequence === request) {
          ++request;

          setData(null);
          setError(
            "Loading documents is taking longer than expected. Please try again."
          );
        }
      }, 20000);

      activeTimer = deadline;

      try {
        const params = new URLSearchParams({
          clientId,
          page: String(query.page),
          search: query.search,
        });

        const response = await fetch(
          "/api/client-documents?" + params,
          {
            signal: controller.signal,
            cache: "no-store",
            headers: {
              "x-aoc-document-client": clientId,
            },
          }
        );

        let result;

        try {
          result = await response.json();
        } catch {
          throw Error(
            "Documents could not be loaded. Please try again."
          );
        }

        if (!response.ok) {
          throw Error(
            typeof result?.error === "string"
              ? result.error
              : "Documents could not be loaded. Please try again."
          );
        }

        if (!result || !Array.isArray(result.items)) {
          throw Error(
            "Documents could not be loaded. Please try again."
          );
        }

        if (
          !disposed &&
          !controller.signal.aborted &&
          sequence === request
        ) {
          setData(result);
        }
      } catch (failure) {
        if (
          !disposed &&
          !controller.signal.aborted &&
          sequence === request
        ) {
          setData(null);
          setError(failure.message);
        }
      } finally {
        window.clearTimeout(deadline);

        if (active === controller) {
          active = null;
        }
      }
    }

    // Screenshot tools can temporarily hide the page.
    // Revalidate silently when returning, keeping the current list visible.
    // Failed authorization still clears the list through the error path.
    const visible = () => {
      if (document.visibilityState === "visible") {
        load();
      }
    };

    // Defer consuming initial data until the active effect runs.
    // This avoids duplicate initial requests during Strict Mode replay.
    Promise.resolve().then(() => {
      if (disposed) {
        return;
      }

      if (skipInitialLoad.current) {
        skipInitialLoad.current = false;
        return;
      }

      return load();
    });

    document.addEventListener("visibilitychange", visible);

    return () => {
      disposed = true;
      ++request;

      active?.abort();
      window.clearTimeout(activeTimer);

      document.removeEventListener("visibilitychange", visible);
    };
  }, [clientId, reload, query]);

  const items = data?.items || [];

  return (
    <section
      className={`${s.panel}${summary ? " " + s.summary : ""}`}
      aria-label="Client document library"
    >
      {/* Library heading */}
      <header>
        <div>
          <small>YOUR CLIENT WORKSPACE</small>
          <h2>Document Library</h2>
          <p>Your shared documents, reports and reference materials.</p>
        </div>

        {summary && (
          <Link href="/?view=documents" prefetch={false}>
            View all documents
          </Link>
        )}
      </header>

      {/* Search controls: hidden in the dashboard summary */}
      {!summary && (
        <form
          className={s.filters}
          aria-label="Find documents"
          onSubmit={(event) => {
            event.preventDefault();

            setData(null);
            setQuery({
              search: search.trim(),
              page: 0,
            });
          }}
        >
          <div className={s.search}>
            <label htmlFor={inputId}>
              Search document titles
            </label>

            <input
              id={inputId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={180}
              placeholder="For example: website audit report"
            />
          </div>

          <div className={s.filterActions}>
            <button type="submit" className={s.primary}>
              Search documents
            </button>

            {(search || query.search) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setData(null);
                  setQuery({
                    search: "",
                    page: 0,
                  });
                }}
              >
                Clear search
              </button>
            )}
          </div>
        </form>
      )}

      {/* Error, loading, or document list */}
      {error ? (
        <div role="alert">
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status">Loading your documents...</p>
      ) : (
        <section
          id="approved-engagement-documents"
          aria-label="Shared documents"
        >
          <div className={s.documentHeading}>
            <h3>Shared documents</h3>

            {!summary && items.length > 0 && (
              <small>Page {query.page + 1}</small>
            )}
          </div>

          {/* Document cards or empty state */}
          {items.length ? (
            <ul className={s.files}>
              {items
                .slice(0, summary ? 3 : 50)
                .map((item) => (
                  <ClientDocument
                    key={
                      clientId + ":" + item.id + ":" + item.viewUrl
                    }
                    item={item}
                  />
                ))}
            </ul>
          ) : query.search ? (
            <div className={s.empty} role="status">
              <strong>No matching documents</strong>
              <p>Try another document title.</p>
            </div>
          ) : (
            <p>
              No documents have been shared yet. Your team will add
              approved files here.
            </p>
          )}

          {/* Pagination */}
          {!summary && (query.page > 0 || data.hasMore) && (
            <nav className={s.actions} aria-label="Document pages">
              <button
                type="button"
                disabled={query.page === 0}
                onClick={() => {
                  setData(null);
                  setQuery((previous) => ({
                    ...previous,
                    page: previous.page - 1,
                  }));
                }}
              >
                Previous documents
              </button>

              <span>Page {query.page + 1}</span>

              <button
                type="button"
                disabled={!data.hasMore}
                onClick={() => {
                  setData(null);
                  setQuery((previous) => ({
                    ...previous,
                    page: previous.page + 1,
                  }));
                }}
              >
                Next documents
              </button>
            </nav>
          )}

          {/* Google Drive access guidance */}
          {items.some((item) => item.delivery === "link") && (
            <p className={s.note}>
              Google Drive controls file access and downloads. If
              prompted, sign in with the Google account the file was
              shared with. Use its download option if the owner allows
              it.
            </p>
          )}
        </section>
      )}
    </section>
  );
}