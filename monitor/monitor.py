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
        "selected_alive": False,
        "running": False,
        "status": "idle",
        "focus_lost": False,
        "streak_seconds": 0,
        "current_speed": 0,
        "penalty_active": False,
        "warn_message": None,
        "processes": [],
        "notices": [],
        "updated_at": None
    }


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
        # 旧版结算把当日原积分留在 days 里，升级时剔除已结算部分，避免与 settled 重复计数；该迁移只执行一次
        if num(saved.get("settlement_version"), 0) < 2:
            for k, v in list(fresh["days"].items()):
                already = num(fresh["settled"].get(k), 0)
                if already > 0:
                    fresh["days"][k] = max(0, num(v, 0) - already)
            fresh["settlement_version"] = 2
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


def add_notice(data, ok, message):
    data["notices"].append({
        "id": int(time.time() * 1000),
        "ok": bool(ok),
        "message": message,
        "time": datetime.datetime.now().isoformat(timespec="seconds")
    })
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


# ---------- 命令处理 ----------
def handle_command(data, cmd, key):
    action = (cmd or {}).get("action")
    payload = (cmd or {}).get("payload") or {}
    settings = data["settings"]

    if action == "select":
        pid = payload.get("pid")
        name = payload.get("name") or ""
        if data["running"]:
            data["running"] = False
            data["status"] = "paused"
        data["selected_pid"] = int(pid) if pid else None
        data["selected_name"] = name if pid else None
        data["selected_path"] = (str(payload.get("path") or "") or None) if pid else None
        data["streak_seconds"] = 0
        data["current_speed"] = 0
        data["focus_lost"] = False
        data["penalty_active"] = False
        data["warn_message"] = None
        if not pid:
            data["status"] = "idle"
        return

    if action == "start":
        if not data["selected_pid"]:
            add_notice(data, False, "请先选择一个应用")
            return
        data["running"] = True
        data["status"] = "focusing"
        data["focus_lost"] = False
        data["streak_seconds"] = 0
        data["penalty_active"] = False
        data["warn_message"] = None
        data["current_speed"] = points_for_second(settings, 1)
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
        add_notice(data, True, "已存入已结算积分 %d，今日共结算 %d 积分。" % (delta, num(data["settled"].get(key, 0), 0)))
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
        data["current_speed"] = points_for_second(data["settings"], max(1, data["streak_seconds"])) if data["running"] else 0
        if not data["settings"]["strict"]["enabled"]:
            data["penalty_active"] = False
            data["warn_message"] = None
        return

    if action == "set_strict":
        data["settings"]["strict"]["enabled"] = bool(payload.get("enabled"))
        data["current_speed"] = points_for_second(data["settings"], max(1, data["streak_seconds"])) if data["running"] else 0
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
        data["today_date"] = key
        data["today_points"] = num(data["days"].get(key, 0), 0)
        data["running"] = False
        data["status"] = "idle"
        data["selected_pid"] = None
        data["selected_name"] = None
        data["selected_path"] = None
        data["selected_alive"] = False
        data["streak_seconds"] = 0
        data["current_speed"] = 0
        data["focus_lost"] = False
        data["penalty_active"] = False
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
    restored = False
    pid = data.get("selected_pid")
    if pid:
        try:
            proc = psutil.Process(int(pid))
            name = proc.name()
            if proc.is_running() and name.lower() == str(data.get("selected_name") or "").lower():
                restored = True
                data["selected_name"] = name
        except (psutil.Error, ValueError, TypeError):
            restored = False
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
        data["selected_pid"] = None
        data["selected_name"] = None
        data["selected_path"] = None
        data["selected_alive"] = False
        data["status"] = "idle"

    day_start = 7 * 60
    day_start_loaded_at = 0
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
                day_start_loaded_at = time.time()

            key = logical_date_key(now, day_start)
            check_day_rollover(data, key)

            # 指令与状态刷新跑在 0.5 秒周期内，点击后能更快被采集端响应
            consume_commands(data, key)

            if time.time() - last_process_refresh > 3:
                data["processes"] = list_gui_processes()
                last_process_refresh = time.time()
                pid = data["selected_pid"]
                data["selected_alive"] = bool(pid) and psutil.pid_exists(pid)

            if data["running"] and data["selected_pid"]:
                fg_pid = get_foreground_pid()
                strict = data["settings"]["strict"]
                if fg_pid == data["selected_pid"]:
                    data["focus_lost"] = False
                    data["penalty_active"] = False
                    data["warn_message"] = None
                    away_seconds = 0.0
                    focus_seconds += delta
                    # 积分仍按整秒结算，循环变快也不会让积分翻倍
                    while focus_seconds >= 1.0:
                        focus_seconds -= 1.0
                        data["streak_seconds"] += 1
                        speed = points_for_second(data["settings"], data["streak_seconds"])
                        data["current_speed"] = speed
                        data["days"][key] = num(data["days"].get(key, 0), 0) + speed
                else:
                    # 不论是否严格模式，只要焦点脱离就标记，界面据此显示警示
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
                data["focus_lost"] = False
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
