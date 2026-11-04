# -*- coding: utf-8 -*-
"""
Starry Flow 专注模块采集守护进程
积分规则搬运自 FocusMeter（F:\\PROJECT FILES\\python proj\\focus\\main.py）：
基础速度、加速档位、严格模式、前台窗口 PID 焦点判断、每日结算、兑换与额度、备份导入。
界面由 Starry Flow 为主，本进程只负责采集与规则执行，状态写入 focus-data.json。
"""

import os
import json
import time
import datetime
import tempfile

import psutil
import win32gui
import win32event
import win32api
import win32process

# 默认放在 LocalAppData，主进程可通过环境变量把数据目录改到用户指定的位置
BASE_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "StarryFlow")
DATA_DIR = os.environ.get("STARRY_FLOW_FOCUS_DIR") or BASE_DIR
FOCUS_FILE = os.path.join(DATA_DIR, "focus-data.json")
COMMAND_DIR = os.path.join(DATA_DIR, "focus-commands")
SETTINGS_FILE = os.environ.get("STARRY_FLOW_SETTINGS_FILE") or os.path.join(BASE_DIR, "settings.json")
LEGACY_MONITOR_FILE = os.path.join(DATA_DIR, "monitor-data.json")
MUTEX_NAME = "StarryFlowFocusMonitor"
SELF_PID = os.environ.get("STARRY_FLOW_SELF_PID")
try:
    SELF_PID_INT = int(SELF_PID) if SELF_PID else None
except (TypeError, ValueError):
    SELF_PID_INT = None


def default_settings():
    """沿用 focus 项目的积分规则默认值。"""
    return {
        "base_points_per_sec": 3,
        "acceleration_enabled": True,
        "acceleration_segments": [[20, 3], [40, 4], [60, 5], [90, 7]],
        "exchange_rate": 1000,
        "allowance_name": "随心额度",
        "strict": {
            "enabled": False,
            "points_per_sec": 14,
            "punish_points": 3,
            "threshold": 15000
        }
    }


def default_data():
    return {
        "version": 2,
        "settings": default_settings(),
        "cumulative_points": 0,
        "allowance": 0,
        "history": [],
        "days": {},
        "settled": {},
        "settlement_version": 2,
        "today_date": None,
        "today_points": 0,
        "selected_pid": None,
        "selected_name": None,
        "selected_path": None,
        # 多进程监控：最多 2 个，焦点命中任意一个都算专注
        "selected_pids": [],
        "selected_alive": False,
        "whitelist_paused": False,
        "running": False,
        "status": "idle",
        "focus_lost": False,
        "streak_seconds": 0,
        "current_speed": 0,
        # 诊断：本轮焦点判定的结果与前台进程，便于排查“选中的进程被当成白名单”
        "focus_reason": "",
        "fg_pid": None,
        "fg_name": "",
        "penalty_active": False,
        "warn_message": None,
        "processes": [],
        "notices": [],
        "updated_at": None,
        # 心理学模型：健康就寝与对赌协议
        "psychology": default_psychology(),
        "day_start_minutes": 7 * 60,
        "sleep_active": False,
        "special_active": False,
        "pacts": {},
        "deficit": 0,
        "counters": {
            "sleep_settles": 0,
            "pact_success": 0,
            "deficit_cleared": 0
        }
    }


def default_psychology():
    """与前端 DEFAULT_SETTINGS.psychology 保持同一份默认值。"""
    return {
        "healthySleep": {
            "enabled": False,
            # 就寝时间段：起止各自可选当日(0)/次日(1)，可跨日
            "startDay": 0,
            "startMinutes": 23 * 60 + 30,
            "endDay": 1,
            "endMinutes": 7 * 60,
            "normalSpeed": 1,
            "strictSpeed": 2
        },
        "pact": {
            "enabled": False,
            "ratio": 80,
            "reward": 100
        }
    }


def sanitize_psychology(raw, day_start_minutes=None):
    """外部设置只接受约定结构，范围与步进与界面一致。"""
    base = default_psychology()
    src = raw if isinstance(raw, dict) else {}
    sleep = src.get("healthySleep") if isinstance(src.get("healthySleep"), dict) else {}
    pact = src.get("pact") if isinstance(src.get("pact"), dict) else {}

    def clamp(value, low, high, fallback):
        v = num(value, fallback)
        try:
            v = float(v)
        except (TypeError, ValueError):
            return fallback
        return max(low, min(high, v))

    ratio = int(round(clamp(pact.get("ratio"), 50, 100, base["pact"]["ratio"]) / 5.0) * 5)
    reward = int(round(clamp(pact.get("reward"), 50, 150, base["pact"]["reward"]) / 5.0) * 5)
    default_sleep = base["healthySleep"]
    day_start = int(max(0, min(1439, num(day_start_minutes, 7 * 60))))
    has_range = isinstance(sleep.get("startMinutes"), (int, float)) or isinstance(sleep.get("endMinutes"), (int, float))
    if has_range:
        start_min = int(round(clamp(sleep.get("startMinutes"), 0, 1439, default_sleep["startMinutes"])))
        start_day = 1 if sleep.get("startDay") == 1 else 0
        end_min = int(round(clamp(sleep.get("endMinutes"), 0, 1439, default_sleep["endMinutes"])))
        end_day = 0 if sleep.get("endDay") == 0 else 1
    else:
        # 旧版只有 bedtimeMinutes：结束点就是逻辑日切点，早于开始点表示跨到次日
        start_min = int(round(clamp(sleep.get("bedtimeMinutes"), 0, 1439, default_sleep["startMinutes"])))
        start_day = 0
        end_min = day_start
        end_day = 1 if day_start < start_min else 0
    return {
        "healthySleep": {
            "enabled": sleep.get("enabled") is True,
            "startDay": start_day,
            "startMinutes": start_min,
            "endDay": end_day,
            "endMinutes": end_min,
            "normalSpeed": max(1, int(round(clamp(sleep.get("normalSpeed"), 1, 999, default_sleep["normalSpeed"])))),
            "strictSpeed": max(1, int(round(clamp(sleep.get("strictSpeed"), 1, 999, default_sleep["strictSpeed"]))))
        },
        "pact": {
            "enabled": pact.get("enabled") is True,
            "ratio": ratio,
            "reward": reward
        }
    }


def in_sleep_window(now, sleep_cfg):
    """就寝时间段：起止各自带「当日/次日」偏移，支持跨日，例如 当日23:00 - 次日07:00。"""
    cfg = sleep_cfg or {}
    start_day = 1 if int(num(cfg.get("startDay"), 0)) == 1 else 0
    end_day = 1 if int(num(cfg.get("endDay"), 1)) == 1 else 0
    start_min = int(max(0, min(1439, num(cfg.get("startMinutes"), 23 * 60 + 30))))
    end_min = int(max(0, min(1439, num(cfg.get("endMinutes"), 7 * 60))))
    base = datetime.datetime(now.year, now.month, now.day)

    # 以今天和昨天为基准各算一次，覆盖跨日与“次日开始”的时间段
    for offset in (0, -1):
        day = base + datetime.timedelta(days=offset)
        start = day + datetime.timedelta(days=start_day, minutes=start_min)
        end = day + datetime.timedelta(days=end_day, minutes=end_min)
        if end == start:
            # 起止完全相同视为未配置有效时间段，避免误判成全天低速
            continue
        if end < start:
            end += datetime.timedelta(days=1)
        if start <= now < end:
            return True
    return False


def clean_pacts(raw):
    out = {}
    if not isinstance(raw, dict):
        return out
    for date, item in raw.items():
        if not isinstance(item, dict):
            continue
        key = str(date)
        goal = int(max(0, num(item.get("goal"), 0)))
        if goal <= 0:
            continue
        status = item.get("status")
        if status not in ("pending", "done", "failed", "partial"):
            status = "pending"
        out[key] = {
            "goal": goal,
            "ratio": int(max(50, min(100, num(item.get("ratio"), 80)))),
            "reward": int(max(50, min(150, num(item.get("reward"), 100)))),
            "status": status,
            "bonus": int(max(0, num(item.get("bonus"), 0))),
            "created_at": str(item.get("created_at") or "")
        }
    return out


def clean_counters(raw):
    base = {"sleep_settles": 0, "pact_success": 0, "deficit_cleared": 0}
    if isinstance(raw, dict):
        for key in base:
            base[key] = int(max(0, num(raw.get(key), 0)))
    return base


def load_json(path):
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return None


def atomic_write(path, obj):
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except Exception:
            pass


def num(value, fallback):
    try:
        v = float(value)
        return int(v) if v.is_integer() else v
    except (TypeError, ValueError):
        return fallback


def merge_settings(saved):
    """把外部传入的规则并入默认规则，做类型与范围校验。"""
    base = default_settings()
    if not isinstance(saved, dict):
        return base

    out = dict(base)
    out["base_points_per_sec"] = max(1, num(saved.get("base_points_per_sec"), base["base_points_per_sec"]))
    out["acceleration_enabled"] = bool(saved.get("acceleration_enabled", base["acceleration_enabled"]))

    segs = saved.get("acceleration_segments")
    if isinstance(segs, list):
        clean = []
        for seg in segs:
            if isinstance(seg, (list, tuple)) and len(seg) >= 2:
                end = max(1, num(seg[0], 0))
                speed = max(1, num(seg[1], 0))
                if end and speed:
                    clean.append([end, speed])
        out["acceleration_segments"] = clean or base["acceleration_segments"]

    out["exchange_rate"] = max(1, num(saved.get("exchange_rate"), base["exchange_rate"]))
    out["allowance_name"] = str(saved.get("allowance_name") or base["allowance_name"])

    strict = saved.get("strict") if isinstance(saved.get("strict"), dict) else {}
    out["strict"] = {
        "enabled": bool(strict.get("enabled", base["strict"]["enabled"])),
        "points_per_sec": max(1, num(strict.get("points_per_sec"), base["strict"]["points_per_sec"])),
        "punish_points": max(0, num(strict.get("punish_points"), base["strict"]["punish_points"])),
        "threshold": max(0, num(strict.get("threshold"), base["strict"]["threshold"]))
    }
    return out


def clean_selected(raw):
    """校验进程集合：最多两个、去重、字段规整。"""
    clean = []
    if not isinstance(raw, list):
        return clean
    for item in raw:
        if not isinstance(item, dict):
            continue
        pid = item.get("pid")
        if not pid:
            continue
        try:
            pid = int(pid)
        except (TypeError, ValueError):
            continue
        if any(p["pid"] == pid for p in clean):
            continue
        clean.append({
            "pid": pid,
            "name": str(item.get("name") or ""),
            "path": str(item.get("path") or "")
        })
        if len(clean) >= 2:
            break
    return clean


def sync_selected(data):
    """selected_pids 为正本，旧版单进程字段同步第一个，兼容旧界面逻辑。"""
    first = data["selected_pids"][0] if data["selected_pids"] else None
    data["selected_pid"] = first["pid"] if first else None
    data["selected_name"] = first["name"] if first else None
    data["selected_path"] = first["path"] if first else None


def is_self_window(pid):
    """判断前台窗口是否属于本软件（主进程或其渲染子进程）。"""
    if not pid or not SELF_PID_INT:
        return False
    if int(pid) == SELF_PID_INT:
        return True
    try:
        return psutil.Process(int(pid)).ppid() == SELF_PID_INT
    except (psutil.Error, ValueError, TypeError):
        return False


def load_data():
    fresh = default_data()
    saved = load_json(FOCUS_FILE)
    if isinstance(saved, dict):
        for key, val in fresh.items():
            if key in saved:
                fresh[key] = saved[key]
        fresh["settings"] = merge_settings(saved.get("settings"))
        if not isinstance(fresh["days"], dict):
            fresh["days"] = {}
        if not isinstance(fresh["settled"], dict):
            fresh["settled"] = {}
        if not isinstance(fresh["history"], list):
            fresh["history"] = []
        if not isinstance(fresh["notices"], list):
            fresh["notices"] = []
        # 兼容旧版单进程选择：把 selected_pid 迁移成 selected_pids
        fresh["selected_pids"] = clean_selected(fresh.get("selected_pids"))
        if not fresh["selected_pids"] and fresh.get("selected_pid"):
            fresh["selected_pids"] = clean_selected([{
                "pid": fresh.get("selected_pid"),
                "name": fresh.get("selected_name"),
                "path": fresh.get("selected_path")
            }])
        sync_selected(fresh)
        # 旧版结算把当日原积分留在 days 里，升级时剔除已结算部分，避免与 settled 重复计数；该迁移只执行一次
        if num(saved.get("settlement_version"), 0) < 2:
            for k, v in list(fresh["days"].items()):
                already = num(fresh["settled"].get(k), 0)
                if already > 0:
                    fresh["days"][k] = max(0, num(v, 0) - already)
            fresh["settlement_version"] = 2
        # 心理学模型相关状态：旧存档缺少时补默认值，避免类型漂移
        fresh["psychology"] = sanitize_psychology(fresh.get("psychology"), fresh.get("day_start_minutes"))
        fresh["pacts"] = clean_pacts(fresh.get("pacts"))
        fresh["deficit"] = int(max(0, num(fresh.get("deficit"), 0)))
        fresh["counters"] = clean_counters(fresh.get("counters"))
        fresh["day_start_minutes"] = int(max(0, num(fresh.get("day_start_minutes"), 7 * 60)))
        fresh["sleep_active"] = fresh.get("sleep_active") is True
        fresh["special_active"] = fresh.get("special_active") is True
        return fresh

    # 首次升级：把旧版纯采集数据（monitor-data.json）的每日积分接过来，
    # 累计积分从 0 起算，避免结算时重复计入。
    legacy = load_json(LEGACY_MONITOR_FILE)
    if isinstance(legacy, dict) and isinstance(legacy.get("days"), dict):
        fresh["days"] = {k: num(v, 0) for k, v in legacy["days"].items() if num(v, 0) > 0}
    return fresh


def logical_date_key(now, day_start_minutes):
    """自定义日切：早于新一天开始时刻的活动归入前一天。"""
    minutes = now.hour * 60 + now.minute
    d = now.date()
    if minutes < day_start_minutes:
        d = d - datetime.timedelta(days=1)
    return d.isoformat()


def get_foreground_pid():
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        return pid or None
    except (PermissionError, OSError):
        return None


def list_gui_processes():
    """枚举可见窗口进程，与 focus 的进程挑选一致。"""
    processes = {}

    def enum_handler(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return True
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            if not pid:
                return True
            title = win32gui.GetWindowText(hwnd)
            if pid not in processes:
                try:
                    proc = psutil.Process(pid)
                    name = proc.name()
                except (psutil.Error, PermissionError, OSError):
                    return True
                try:
                    exe = proc.exe() or ""
                except (psutil.Error, PermissionError, OSError):
                    exe = ""
                processes[pid] = {
                    "pid": pid,
                    "name": name,
                    "title": title or name,
                    "path": exe
                }
        except (PermissionError, OSError):
            pass
        return True

    win32gui.EnumWindows(enum_handler, None)
    if SELF_PID:
        processes.pop(int(SELF_PID), None)
    return sorted(processes.values(), key=lambda p: (p["name"].lower(), p["title"].lower()))


# ---------- 积分规则 ----------
def points_for_second(settings, streak_seconds):
    if settings["strict"]["enabled"]:
        return settings["strict"]["points_per_sec"]
    base = settings["base_points_per_sec"]
    if not settings["acceleration_enabled"]:
        return base
    segments = settings["acceleration_segments"]
    if not segments:
        return base
    for end, speed in segments:
        if streak_seconds <= end:
            return speed
    return segments[-1][1]


def effective_speed(data, streak_seconds):
    """普通/严格模式的速度，若正处于健康就寝时段则改用设定值。"""
    settings = data["settings"]
    speed = points_for_second(settings, streak_seconds)
    psych = data.get("psychology") or default_psychology()
    sleep_cfg = psych.get("healthySleep") or {}
    if sleep_cfg.get("enabled") and in_sleep_window(datetime.datetime.now(), sleep_cfg):
        key = "strictSpeed" if settings["strict"]["enabled"] else "normalSpeed"
        speed = int(max(1, num(sleep_cfg.get(key), speed)))
    return speed


def sanitize_special_whitelist(raw):
    """特殊白名单：最多 5 个进程，允许包含本软件自身，按路径去重。"""
    items = []
    seen = set()
    src = raw if isinstance(raw, dict) else {}
    for item in (src.get("items") or [])[:12]:
        if not isinstance(item, dict) or len(items) >= 5:
            continue
        is_self = item.get("self") is True
        name = str(item.get("name") or "").strip()
        path = str(item.get("path") or "").strip()
        if not is_self and not name:
            continue
        key = "__self__" if is_self else (path.lower() or ("name:" + name.lower()))
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "name": name or "Starry Flow",
            "path": "" if is_self else path,
            "self": is_self
        })
    return {
        "enabled": src.get("enabled") is True,
        "normalSpeed": max(1, int(num(src.get("normalSpeed"), 2))),
        "strictSpeed": max(1, int(num(src.get("strictSpeed"), 3))),
        "items": items
    }


def process_exe_path(pid):
    """取进程可执行路径；取不到时返回空串，不影响主循环。"""
    if not pid:
        return ""
    try:
        return str(psutil.Process(int(pid)).exe() or "")
    except (psutil.Error, ValueError, TypeError, OSError):
        return ""


def in_special_whitelist(fg_pid, cfg, fg_path=None):
    """焦点是否落在特殊白名单进程上；命中后不算偏离但积分降速。"""
    if not cfg.get("enabled") or not cfg.get("items") or not fg_pid:
        return False
    items = cfg["items"]
    if any(item.get("self") for item in items) and is_self_window(fg_pid):
        return True
    paths = {
        os.path.normcase(str(item.get("path")))
        for item in items
        if item.get("path")
    }
    if not paths:
        return False
    exe = fg_path if fg_path else process_exe_path(fg_pid)
    if not exe:
        return False
    return os.path.normcase(str(exe)) in paths


def special_whitelist_speed(settings, cfg):
    key = "strictSpeed" if settings["strict"]["enabled"] else "normalSpeed"
    return int(max(1, num(cfg.get(key), 2)))


def add_notice(data, ok, message, celebrate=False):
    item = {
        "id": int(time.time() * 1000),
        "ok": bool(ok),
        "message": message,
        "time": datetime.datetime.now().isoformat(timespec="seconds")
    }
    if celebrate:
        item["celebrate"] = True
    data["notices"].append(item)
    data["notices"] = data["notices"][-8:]


def settle_into_cumulative(data, date_key):
    """把某一天尚未结算的积分并入累计，并清零当日未结算积分。"""
    points = num(data["days"].get(date_key, 0), 0)
    if points <= 0:
        return 0
    total = num(data["settled"].get(date_key, 0), 0) + points
    data["cumulative_points"] = num(data["cumulative_points"], 0) + points
    data["settled"][date_key] = total
    data["days"][date_key] = 0
    data["history"] = [r for r in data["history"] if not (isinstance(r, dict) and r.get("date") == date_key)]
    data["history"].append({
        "date": date_key,
        "points": total
    })
    return points


def evaluate_pacts(data, today_key, psychology):
    """对赌判定：当天达标立即发奖；过期未达判定比例则产生等额赤字。"""
    pact_cfg = (psychology or default_psychology()).get("pact") or {}
    if not pact_cfg.get("enabled"):
        return
    pacts = data.get("pacts")
    if not isinstance(pacts, dict) or not pacts:
        return

    for date in sorted(pacts.keys()):
        item = pacts[date]
        if not isinstance(item, dict) or item.get("status") != "pending":
            continue
        if date > today_key:
            continue
        goal = int(num(item.get("goal"), 0))
        if goal <= 0:
            continue
        total = int(num(data["days"].get(date), 0)) + int(num(data["settled"].get(date), 0))
        ratio = int(num(item.get("ratio"), 80))
        reward_pct = int(num(item.get("reward"), 100))

        if total >= goal:
            bonus = int(round(goal * reward_pct / 100.0))
            if date == today_key:
                data["days"][date] = int(num(data["days"].get(date), 0)) + bonus
            else:
                # 错过的日期在日切后才达标：奖励补记到那一天的已结算积分
                data["settled"][date] = int(num(data["settled"].get(date), 0)) + bonus
                data["cumulative_points"] = int(num(data["cumulative_points"], 0)) + bonus
                for record in data["history"]:
                    if isinstance(record, dict) and record.get("date") == date:
                        record["points"] = data["settled"][date]
            item["status"] = "done"
            item["bonus"] = bonus
            data["counters"]["pact_success"] = int(num(data["counters"].get("pact_success"), 0)) + 1
            add_notice(
                data, True,
                "星辉契约达成：%s 目标 %d 积分，额外奖励 %d 积分。" % (date, goal, bonus),
                celebrate=True
            )
        elif date < today_key and total < goal * ratio / 100.0:
            data["deficit"] = int(num(data.get("deficit"), 0)) + goal
            item["status"] = "failed"
            add_notice(
                data, False,
                "星辉契约未达成：%s 累计 %d，未到目标的 %d%%，欠下 %d 赤字积分。" % (date, total, ratio, goal)
            )
        elif date < today_key:
            # 达到判定比例但没到目标：不奖励也不产生赤字
            item["status"] = "partial"


# ---------- 命令处理 ----------
def handle_command(data, cmd, key):
    action = (cmd or {}).get("action")
    payload = (cmd or {}).get("payload") or {}
    settings = data["settings"]

    if action == "select":
        raw = payload.get("pids")
        if not isinstance(raw, list):
            raw = [{"pid": payload.get("pid"), "name": payload.get("name"), "path": payload.get("path")}]
        selected = clean_selected(raw)
        if data["running"]:
            data["running"] = False
            data["status"] = "paused"
        data["selected_pids"] = selected
        sync_selected(data)
        data["selected_alive"] = bool(selected) and any(psutil.pid_exists(p["pid"]) for p in selected)
        data["streak_seconds"] = 0
        data["current_speed"] = 0
        data["focus_lost"] = False
        data["penalty_active"] = False
        data["whitelist_paused"] = False
        data["warn_message"] = None
        if not selected:
            data["status"] = "idle"
        return

    if action == "start":
        if not data["selected_pids"]:
            add_notice(data, False, "请先选择一个应用")
            return
        data["running"] = True
        data["status"] = "focusing"
        data["focus_lost"] = False
        data["streak_seconds"] = 0
        data["penalty_active"] = False
        data["warn_message"] = None
        data["current_speed"] = effective_speed(data, 1)
        return

    if action == "pause":
        data["running"] = False
        data["status"] = "paused"
        data["focus_lost"] = False
        data["streak_seconds"] = 0
        data["current_speed"] = 0
        data["penalty_active"] = False
        data["warn_message"] = None
        return

    if action == "settle":
        today_points = num(data["days"].get(key, 0), 0)
        already = num(data["settled"].get(key, 0), 0)
        if today_points <= 0:
            if already > 0:
                add_notice(data, False, "本轮没有新增积分，今日已结算 %d 积分。" % already)
            else:
                add_notice(data, False, "今日还没有积分，无需结算。")
            return
        strict = settings["strict"]
        total_today = already + today_points
        if strict["enabled"] and total_today < strict["threshold"]:
            add_notice(data, False, "严格模式下，本日累计积分需达到 %d 才能结算。当前 %d，未达到门槛，本次结算已取消。" % (strict["threshold"], total_today))
            return
        delta = settle_into_cumulative(data, key)
        if delta <= 0:
            add_notice(data, False, "本轮没有新增积分，无需结算。")
            return
        # 结算后收束本轮专注，让用户可以在同一天再次开始
        data["running"] = False
        data["status"] = "idle"
        data["streak_seconds"] = 0
        data["current_speed"] = 0
        data["focus_lost"] = False
        data["penalty_active"] = False
        data["warn_message"] = None
        # 健康就寝：就寝时段内点击结算，记一次「乖乖睡觉」纪念章
        sleep_cfg = (data.get("psychology") or default_psychology()).get("healthySleep") or {}
        if sleep_cfg.get("enabled") and in_sleep_window(datetime.datetime.now(), sleep_cfg):
            counters = data["counters"]
            counters["sleep_settles"] = int(num(counters.get("sleep_settles"), 0)) + 1
        add_notice(data, True, "已存入已结算积分 %d，今日共结算 %d 积分。" % (delta, num(data["settled"].get(key, 0), 0)))
        return

    if action == "set_pact":
        psych = data.get("psychology") or default_psychology()
        pact_cfg = psych.get("pact") or {}
        if not pact_cfg.get("enabled"):
            add_notice(data, False, "请先在设置中开启星辉契约。")
            return
        date = str(payload.get("date") or "")
        goal = int(max(0, num(payload.get("goal"), 0)))
        if len(date) != 10 or date[4] != "-" or date[7] != "-":
            add_notice(data, False, "请选择有效的日期。")
            return
        if date < key:
            add_notice(data, False, "星辉契约不能设在过去的日期。")
            return
        if goal <= 0:
            add_notice(data, False, "计划积分需大于 0。")
            return
        # 已结束的对赌保留记录（星点圆点常驻），不允许再改
        previous = data["pacts"].get(date)
        if isinstance(previous, dict) and previous.get("status") != "pending":
            add_notice(data, False, "当日星辉契约已结束，无法修改。")
            return
        # 对赌一旦立下不可删除、不可降低：已存在时只能把目标往上调
        old_goal = int(max(0, num(previous.get("goal"), 0))) if isinstance(previous, dict) else 0
        if isinstance(previous, dict) and goal <= old_goal:
            add_notice(data, False, "星辉契约目标只能提高，当前目标 %d 积分。" % old_goal)
            return
        data["pacts"][date] = {
            "goal": goal,
            "ratio": int(num(pact_cfg.get("ratio"), 80)),
            "reward": int(num(pact_cfg.get("reward"), 100)),
            "status": "pending",
            "bonus": 0,
            "created_at": (previous or {}).get("created_at") or datetime.datetime.now().isoformat(timespec="seconds")
        }
        if old_goal > 0:
            add_notice(data, True, "已将 %s 的星辉契约目标从 %d 提高到 %d 积分。" % (date, old_goal, goal))
        else:
            add_notice(data, True, "已立下 %s 的星辉契约：目标 %d 积分。" % (date, goal))
        return

    if action == "cancel_pact":
        # 对赌一旦立下不可取消，保留指令仅为兼容旧客户端
        add_notice(data, False, "星辉契约一旦立下不可取消。")
        return

    if action == "pay_deficit":
        amount = int(max(0, num(payload.get("amount"), 0)))
        deficit = int(num(data.get("deficit"), 0))
        if deficit <= 0:
            add_notice(data, False, "当前没有赤字积分。")
            return
        if amount <= 0:
            add_notice(data, False, "请输入要偿还的积分。")
            return
        day_points = int(num(data["days"].get(key), 0))
        settled_today = int(num(data["settled"].get(key), 0))
        pay = min(amount, deficit, day_points + settled_today)
        if pay <= 0:
            add_notice(data, False, "当日累计积分为 0，暂时无法偿还。")
            return
        from_days = min(day_points, pay)
        data["days"][key] = day_points - from_days
        rest = pay - from_days
        if rest > 0:
            data["settled"][key] = max(0, settled_today - rest)
            data["cumulative_points"] = max(0, int(num(data["cumulative_points"], 0)) - rest)
            for record in data["history"]:
                if isinstance(record, dict) and record.get("date") == key:
                    record["points"] = data["settled"][key]
        data["deficit"] = max(0, deficit - pay)
        if data["deficit"] == 0:
            counters = data["counters"]
            counters["deficit_cleared"] = int(num(counters.get("deficit_cleared"), 0)) + 1
            add_notice(data, True, "赤字已全部填平，获得「平账大师」纪念章 ×1。")
        elif pay < amount:
            add_notice(data, True, "当日累计不足，已偿还 %d，剩余赤字 %d。" % (pay, data["deficit"]))
        else:
            add_notice(data, True, "已偿还 %d，剩余赤字 %d。" % (pay, data["deficit"]))
        return

    if action == "adjust_totals":
        points = int(num(payload.get("points"), 0))
        allowance_delta = int(num(payload.get("allowance"), 0))
        if points == 0 and allowance_delta == 0:
            add_notice(data, False, "请输入要调整的积分或额度。")
            return
        if points:
            data["cumulative_points"] = max(0, int(num(data["cumulative_points"], 0)) + points)
        if allowance_delta:
            data["allowance"] = max(0, int(num(data["allowance"], 0)) + allowance_delta)
        add_notice(data, True, "已调整已结算积分 %+d，%s %+d。" % (points, settings["allowance_name"], allowance_delta))
        return

    if action == "update_settings":
        data["settings"] = merge_settings(payload.get("settings"))
        data["current_speed"] = effective_speed(data, max(1, data["streak_seconds"])) if data["running"] else 0
        if not data["settings"]["strict"]["enabled"]:
            data["penalty_active"] = False
            data["warn_message"] = None
        return

    if action == "set_strict":
        data["settings"]["strict"]["enabled"] = bool(payload.get("enabled"))
        data["current_speed"] = effective_speed(data, max(1, data["streak_seconds"])) if data["running"] else 0
        if not payload.get("enabled"):
            data["penalty_active"] = False
            data["warn_message"] = None
        return

    if action == "exchange":
        amount = num(payload.get("amount"), 0)
        if amount <= 0:
            add_notice(data, False, "兑换数量需大于 0。")
            return
        rate = max(1, num(settings["exchange_rate"], 1000))
        cost = int(amount * rate)
        if cost > num(data["cumulative_points"], 0):
            add_notice(data, False, "积分不足，需要 %d，当前只有 %d。" % (cost, num(data["cumulative_points"], 0)))
            return
        data["cumulative_points"] = num(data["cumulative_points"], 0) - cost
        data["allowance"] = num(data["allowance"], 0) + amount
        add_notice(data, True, "已用 %d 积分兑换 %d %s。" % (cost, amount, settings["allowance_name"]))
        return

    if action == "spend":
        amount = num(payload.get("amount"), 0)
        if amount <= 0:
            add_notice(data, False, "花费数量需大于 0。")
            return
        if amount > num(data["allowance"], 0):
            add_notice(data, False, "额度不足，当前%s只有 %d。" % (settings["allowance_name"], num(data["allowance"], 0)))
            return
        data["allowance"] = num(data["allowance"], 0) - amount
        add_notice(data, True, "已花费 %d %s，剩余 %d。" % (amount, settings["allowance_name"], data["allowance"]))
        return

    if action == "import":
        incoming = payload.get("data")
        if not isinstance(incoming, dict) or "cumulative_points" not in incoming:
            add_notice(data, False, "备份文件无效，缺少已结算积分数据。")
            return
        data["settings"] = merge_settings(incoming.get("settings"))
        data["cumulative_points"] = num(incoming.get("cumulative_points"), 0)
        data["allowance"] = num(incoming.get("allowance"), 0)
        data["days"] = {str(k): num(v, 0) for k, v in (incoming.get("days") or {}).items()}
        data["settled"] = {str(k): num(v, 0) for k, v in (incoming.get("settled") or {}).items()}
        data["history"] = [r for r in (incoming.get("history") or []) if isinstance(r, dict)]
        # 完整恢复：对赌、赤字、事件计数与心理学配置都属于用户状态，缺一项就不算“一模一样”
        data["psychology"] = sanitize_psychology(incoming.get("psychology"), incoming.get("day_start_minutes"))
        data["day_start_minutes"] = int(max(0, num(incoming.get("day_start_minutes"), data.get("day_start_minutes") or 7 * 60)))
        data["pacts"] = clean_pacts(incoming.get("pacts"))
        data["deficit"] = int(max(0, num(incoming.get("deficit"), 0)))
        data["counters"] = clean_counters(incoming.get("counters"))
        # 新版备份的 days / settled 已是同一口径，不再跑一次性迁移
        data["settlement_version"] = 2
        data["today_date"] = key
        data["today_points"] = num(data["days"].get(key, 0), 0)
        data["running"] = False
        data["status"] = "idle"
        data["selected_pids"] = []
        sync_selected(data)
        data["selected_alive"] = False
        data["streak_seconds"] = 0
        data["current_speed"] = 0
        data["focus_lost"] = False
        data["penalty_active"] = False
        data["whitelist_paused"] = False
        data["warn_message"] = None
        add_notice(data, True, "备份已导入，采集已暂停，请重新选择进程。")
        return

    if action == "refresh_processes":
        data["processes"] = list_gui_processes()
        return


def consume_commands(data, key):
    """命令按「一命令一文件」投递，避免读写队列时丢指令。"""
    try:
        names = sorted(os.listdir(COMMAND_DIR))
    except OSError:
        return
    for name in names[:60]:
        if not name.endswith(".json"):
            continue
        path = os.path.join(COMMAND_DIR, name)
        cmd = load_json(path)
        if isinstance(cmd, dict):
            handle_command(data, cmd, key)
        try:
            os.remove(path)
        except OSError:
            pass


def check_day_rollover(data, key):
    if data["today_date"] == key:
        return
    prev = data["today_date"]
    if prev:
        settle_into_cumulative(data, prev)
    data["today_date"] = key
    data["today_points"] = num(data["days"].get(key, 0), 0)


def main():
    mutex = win32event.CreateMutex(None, False, MUTEX_NAME)
    if win32api.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        print("[StarryFlow] 已有采集实例在运行，本进程退出")
        return

    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(COMMAND_DIR, exist_ok=True)
    data = load_data()
    data["running"] = False
    data["focus_lost"] = False
    data["streak_seconds"] = 0
    data["current_speed"] = 0
    data["penalty_active"] = False
    data["warn_message"] = None
    data["notices"] = []

    # 恢复上次选中的进程：PID 仍存在且进程名一致时才保留，避免 PID 复用误认
    alive = []
    for item in data["selected_pids"]:
        try:
            proc = psutil.Process(int(item["pid"]))
            if proc.is_running() and proc.name().lower() == str(item.get("name") or "").lower():
                alive.append({
                    "pid": int(item["pid"]),
                    "name": proc.name(),
                    "path": str(item.get("path") or "")
                })
        except (psutil.Error, ValueError, TypeError):
            continue
    data["selected_pids"] = alive[:2]
    sync_selected(data)
    restored = bool(alive)
    if restored:
        # 今日已结算且本轮没有新增积分时，重启后直接显示「开始专注」
        shared = load_json(SETTINGS_FILE)
        day_start_minutes = 7 * 60
        if isinstance(shared, dict):
            day_start_minutes = max(0, num(shared.get("dayStartMinutes"), day_start_minutes))
        today_key = logical_date_key(datetime.datetime.now(), day_start_minutes)
        settled_today = num(data["settled"].get(today_key), 0)
        today_points = num(data["days"].get(today_key), 0)
        data["status"] = "idle" if settled_today > 0 and today_points == 0 else "paused"
        data["selected_alive"] = True
    else:
        data["selected_alive"] = False
        data["status"] = "idle"

    day_start = 7 * 60
    day_start_loaded_at = 0
    self_whitelist = False
    psychology = default_psychology()
    special_whitelist = sanitize_special_whitelist(None)
    shared_now = load_json(SETTINGS_FILE)
    if isinstance(shared_now, dict):
        day_start = max(0, num(shared_now.get("dayStartMinutes"), day_start))
        psychology = sanitize_psychology(shared_now.get("psychology"), day_start)
        special_whitelist = sanitize_special_whitelist(shared_now.get("specialWhitelist"))
    data["day_start_minutes"] = day_start
    data["psychology"] = psychology
    data["sleep_active"] = bool(
        psychology["healthySleep"]["enabled"]
        and in_sleep_window(datetime.datetime.now(), psychology["healthySleep"])
    )
    last_process_refresh = 0
    last_mono = time.monotonic()
    focus_seconds = 0.0
    away_seconds = 0.0
    key = None

    print("[StarryFlow] 专注模块已启动")

    try:
        while True:
            mono = time.monotonic()
            delta = min(1.0, max(0.0, mono - last_mono))
            last_mono = mono
            now = datetime.datetime.now()

            if time.time() - day_start_loaded_at > 5:
                shared = load_json(SETTINGS_FILE)
                if isinstance(shared, dict):
                    day_start = max(0, num(shared.get("dayStartMinutes"), day_start))
                    # 本软件白名单开关由界面写入 settings.json，这里定期刷新
                    self_whitelist = bool(shared.get("selfWhitelist"))
                    psychology = sanitize_psychology(shared.get("psychology"), day_start)
                    data["psychology"] = psychology
                    special_whitelist = sanitize_special_whitelist(shared.get("specialWhitelist"))
                data["day_start_minutes"] = day_start
                day_start_loaded_at = time.time()

            # 就寝时段内界面提示计时降速
            data["sleep_active"] = bool(
                psychology["healthySleep"]["enabled"]
                and in_sleep_window(now, psychology["healthySleep"])
            )
            # 特殊白名单命中标记每轮先归零，命中时再置真
            data["special_active"] = False

            key = logical_date_key(now, day_start)
            check_day_rollover(data, key)

            # 指令与状态刷新跑在 0.5 秒周期内，点击后能更快被采集端响应
            consume_commands(data, key)

            # 对赌：当天达标即时发奖，过期的在日切后判定赤字
            evaluate_pacts(data, key, psychology)

            if time.time() - last_process_refresh > 3:
                data["processes"] = list_gui_processes()
                last_process_refresh = time.time()
                data["selected_alive"] = any(psutil.pid_exists(p["pid"]) for p in data["selected_pids"])

            if data["running"] and data["selected_pids"]:
                fg_pid = get_foreground_pid()
                fg_path = process_exe_path(fg_pid)
                strict = data["settings"]["strict"]
                selected_ids = {p["pid"] for p in data["selected_pids"]}
                # 除了 PID，也按可执行路径认人：多进程应用、重启后 PID 变化时仍能算回专注
                selected_paths = {
                    os.path.normcase(str(p.get("path")))
                    for p in data["selected_pids"]
                    if p.get("path")
                }
                path_hit = bool(fg_path) and os.path.normcase(fg_path) in selected_paths
                data["fg_pid"] = fg_pid
                data["fg_name"] = ""
                if fg_pid:
                    try:
                        data["fg_name"] = psutil.Process(int(fg_pid)).name()
                    except (psutil.Error, ValueError, TypeError, OSError):
                        data["fg_name"] = ""

                if fg_pid and (fg_pid in selected_ids or path_hit):
                    # 焦点命中工作区内任意一个进程都算专注，选择优先于所有白名单
                    data["focus_reason"] = "selected-path" if path_hit and fg_pid not in selected_ids else "selected"
                    data["focus_lost"] = False
                    data["penalty_active"] = False
                    data["whitelist_paused"] = False
                    data["special_active"] = False
                    data["warn_message"] = None
                    away_seconds = 0.0
                    # 分支一进入就更新显示速度，避免界面上短暂停留在上一个白名单速度
                    data["current_speed"] = effective_speed(data, max(1, data["streak_seconds"]))
                    focus_seconds += delta
                    # 积分仍按整秒结算，循环变快也不会让积分翻倍
                    while focus_seconds >= 1.0:
                        focus_seconds -= 1.0
                        data["streak_seconds"] += 1
                        speed = effective_speed(data, data["streak_seconds"])
                        data["current_speed"] = speed
                        data["days"][key] = num(data["days"].get(key, 0), 0) + speed
                elif self_whitelist and is_self_window(fg_pid):
                    # 本软件白名单：暂停计时，不算偏离，严格模式也不倒扣
                    data["focus_reason"] = "self"
                    data["focus_lost"] = False
                    data["penalty_active"] = False
                    data["whitelist_paused"] = True
                    data["special_active"] = False
                    data["warn_message"] = None
                    focus_seconds = 0.0
                    away_seconds = 0.0
                    data["streak_seconds"] = 0
                    data["current_speed"] = 0
                    data["status"] = "focusing"
                elif in_special_whitelist(fg_pid, special_whitelist, fg_path):
                    # 特殊白名单：不算偏离，积分照常累积，但按设定速度降速
                    data["focus_reason"] = "special"
                    data["focus_lost"] = False
                    data["penalty_active"] = False
                    data["whitelist_paused"] = False
                    data["special_active"] = True
                    data["warn_message"] = None
                    away_seconds = 0.0
                    data["current_speed"] = special_whitelist_speed(data["settings"], special_whitelist)
                    focus_seconds += delta
                    while focus_seconds >= 1.0:
                        focus_seconds -= 1.0
                        data["streak_seconds"] += 1
                        speed = special_whitelist_speed(data["settings"], special_whitelist)
                        data["current_speed"] = speed
                        data["days"][key] = num(data["days"].get(key, 0), 0) + speed
                else:
                    # 不论是否严格模式，只要焦点脱离就标记，界面据此显示警示
                    data["focus_reason"] = "away"
                    data["whitelist_paused"] = False
                    data["focus_lost"] = True
                    focus_seconds = 0.0
                    data["streak_seconds"] = 0
                    data["current_speed"] = 0
                    if strict["enabled"]:
                        data["penalty_active"] = True
                        data["warn_message"] = "已离开专注进程，每秒扣 %d 积分" % strict["punish_points"]
                        away_seconds += delta
                        while away_seconds >= 1.0:
                            away_seconds -= 1.0
                            lost = num(strict["punish_points"], 0)
                            data["days"][key] = max(0, num(data["days"].get(key, 0), 0) - lost)
                    else:
                        data["penalty_active"] = False
                        data["warn_message"] = None
                        away_seconds = 0.0
                    data["status"] = "focusing"
            else:
                data["focus_reason"] = "idle"
                data["fg_pid"] = None
                data["fg_name"] = ""
                data["focus_lost"] = False
                data["whitelist_paused"] = False
                focus_seconds = 0.0
                away_seconds = 0.0

            data["today_points"] = num(data["days"].get(key, 0), 0)
            data["status"] = "focusing" if data["running"] else data["status"]
            data["updated_at"] = now.isoformat(timespec="seconds")
            atomic_write(FOCUS_FILE, data)

            time.sleep(0.5)
    except KeyboardInterrupt:
        print("[StarryFlow] 采集端已退出")
    finally:
        data["running"] = False
        data["status"] = "idle"
        atomic_write(FOCUS_FILE, data)


if __name__ == "__main__":
    main()
