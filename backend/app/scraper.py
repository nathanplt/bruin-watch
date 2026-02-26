import re
from contextlib import suppress
from dataclasses import asdict, dataclass
from typing import Iterable
from urllib.parse import urlencode

from playwright.async_api import (
    Locator,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

BASE_RESULTS_URL = "https://sa.ucla.edu/ro/public/soc/Results"


@dataclass
class SectionStatus:
    section: str
    status: str
    is_open: bool


@dataclass
class PrimaryGroup:
    primary: SectionStatus
    discussions: list[SectionStatus]
    is_enrollable: bool


@dataclass
class CourseStatus:
    course_number: str
    course_title: str
    groups: list[PrimaryGroup]
    is_enrollable: bool


def build_cs_results_url(term: str) -> str:
    params = {
        "SubjectAreaName": "Computer Science (COM SCI)",
        "t": term,
        "sBy": "subject",
        "subj": "COM SCI",
        "catlg": "",
        "cls_no": "",
        "undefined": "Go",
        "btnIsInIndex": "btn_inIndex",
    }
    return f"{BASE_RESULTS_URL}?{urlencode(params)}"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def status_is_open(status: str) -> bool:
    return normalize_text(status).lower().startswith("open")


def normalize_course_inputs(raw_courses: Iterable[str]) -> list[str]:
    courses: list[str] = []
    for raw in raw_courses:
        for candidate in raw.split(","):
            normalized = candidate.upper().replace("COM SCI", "").strip()
            if normalized:
                courses.append(normalized)
    return courses


async def extract_section_status(row: Locator) -> SectionStatus:
    section_link = row.locator(".cls-section a")
    if await section_link.count():
        section = normalize_text(await section_link.first.inner_text())
    else:
        section = normalize_text(await row.locator(".cls-section").first.inner_text())

    status = normalize_text(await row.locator(".statusColumn").first.inner_text())
    return SectionStatus(section=section, status=status, is_open=status_is_open(status))


async def find_course_root(page: Page, course_number: str) -> tuple[Locator, Locator, str]:
    pattern = re.compile(rf"^\s*{re.escape(course_number)}\s*-", re.IGNORECASE)
    course_buttons = page.locator("h3.head > button[id$='-title']").filter(has_text=pattern)

    if await course_buttons.count() == 0:
        raise ValueError(f"COM SCI {course_number} was not found on the page.")

    button = course_buttons.first
    button_id = await button.get_attribute("id")
    if not button_id:
        raise RuntimeError(f"Unable to determine DOM id for COM SCI {course_number}.")

    course_title = normalize_text(await button.inner_text())
    course_dom_id = button_id.removesuffix("-title")
    return page.locator(f"#{course_dom_id}"), button, course_title


async def ensure_course_expanded(course_button: Locator, course_root: Locator) -> None:
    if await course_button.get_attribute("aria-expanded") != "true":
        await course_button.click()
    primary_rows = course_root.locator(".data_row.primary-row")

    try:
        await primary_rows.first.wait_for(state="attached", timeout=20000)
    except PlaywrightTimeoutError:
        if await course_button.get_attribute("aria-expanded") != "true":
            await course_button.click()
        await primary_rows.first.wait_for(state="attached", timeout=20000)


async def maybe_expand_primary_row(page: Page, primary_row: Locator) -> None:
    toggle_icon = primary_row.locator(".toggle i")
    if await toggle_icon.count() == 0:
        return

    icon_classes = await toggle_icon.first.get_attribute("class") or ""
    if "icon-caret-right" not in icon_classes:
        return

    toggle_button = primary_row.locator(".toggle button")
    if await toggle_button.count():
        primary_row_id = await primary_row.get_attribute("id")
        await toggle_button.first.click()
        if primary_row_id:
            discussion_rows = page.locator(
                f"[id='{primary_row_id}-children'] .data_row.secondary-row"
            )
            with suppress(PlaywrightTimeoutError):
                await discussion_rows.first.wait_for(state="attached", timeout=5000)
        with suppress(PlaywrightTimeoutError):
            await page.wait_for_load_state("networkidle", timeout=5000)


async def get_course_status(page: Page, course_number: str) -> CourseStatus:
    course_root, course_button, raw_title = await find_course_root(page, course_number)
    await ensure_course_expanded(course_button, course_root)
    course_title = raw_title.split(" - ", maxsplit=1)[-1]

    primary_rows = course_root.locator(".data_row.primary-row")
    primary_count = await primary_rows.count()
    if primary_count == 0:
        raise RuntimeError(f"No section rows found for COM SCI {course_number}.")

    groups: list[PrimaryGroup] = []
    for idx in range(primary_count):
        primary_row = primary_rows.nth(idx)
        await maybe_expand_primary_row(page, primary_row)
        primary = await extract_section_status(primary_row)

        primary_row_id = await primary_row.get_attribute("id")
        discussions: list[SectionStatus] = []
        if primary_row_id:
            discussion_rows = course_root.locator(
                f"[id='{primary_row_id}-children'] .data_row.secondary-row"
            )
            discussion_count = await discussion_rows.count()
            for discussion_idx in range(discussion_count):
                discussion_row = discussion_rows.nth(discussion_idx)
                discussions.append(await extract_section_status(discussion_row))

        group_is_enrollable = primary.is_open and (
            not discussions or any(discussion.is_open for discussion in discussions)
        )
        groups.append(
            PrimaryGroup(
                primary=primary,
                discussions=discussions,
                is_enrollable=group_is_enrollable,
            )
        )

    return CourseStatus(
        course_number=course_number,
        course_title=course_title,
        groups=groups,
        is_enrollable=any(group.is_enrollable for group in groups),
    )


async def fetch_course_statuses(
    courses: Iterable[str],
    term: str,
    *,
    headful: bool = False,
) -> list[CourseStatus]:
    normalized_courses = normalize_course_inputs(courses)
    if not normalized_courses:
        raise ValueError("No valid course numbers were provided.")

    url = build_cs_results_url(term)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=not headful)
        page = await browser.new_page()
        try:
            await page.goto(url, wait_until="networkidle")
            await page.wait_for_selector("h3.head > button[id$='-title']")
            results: list[CourseStatus] = []
            for course in normalized_courses:
                results.append(await get_course_status(page, course))
            return results
        finally:
            await browser.close()


def serialize_course_status(course: CourseStatus) -> dict:
    return asdict(course)
