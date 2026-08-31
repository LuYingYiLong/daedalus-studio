#include "control.h"
#include "control-activation.h"
#include <dwmapi.h>
#include <objbase.h>
#include <oaidl.h>
#include <uiautomation.h>
#include <cmath>
#include <map>
#include <chrono>

static constexpr ULONG_PTR INPUT_TAG = 0xDAEDA105;
InputController *InputController::instance = nullptr;
InputController::InputController(DWORD parent, std::function<void(const Json &)> notify)
    : parent(parent), notify(std::move(notify)) {
  instance = this;
  watcher = std::thread([this] { watch(); });
}
InputController::~InputController() {
  stop(); quitting = true;
  if (watcher.joinable()) watcher.join();
  instance = nullptr;
}
void InputController::heartbeat() { heartbeatAt = GetTickCount64(); }
void InputController::stop() {
  active = false; arming = false; ++generation; window = nullptr;
}
void InputController::pause(const std::string &code) {
  const bool wasActive = active.exchange(false), wasArming = arming.exchange(false);
  if (!wasActive && !wasArming) return;
  const unsigned current = ++generation;
  // LL hook 不等待正在派发的键盘调用，先使代次失效
  Json value;
  text(value, L"event", "paused"); text(value, L"code", code);
  number(value, L"generation", current);
  notify(value);
}
LRESULT CALLBACK InputController::mouseHook(int code, WPARAM kind, LPARAM data) {
  auto self = instance;
  if (code >= 0 && self && (self->active || self->arming)) {
    // 移动鼠标只是用户观察，不应抢占电脑操作；按键、滚轮和点击才算接管
    if (kind != WM_MOUSEMOVE) {
      self->userActivityAt = GetTickCount64();
      if (self->active) self->pause("computer_user_takeover");
    }
  }
  return CallNextHookEx(nullptr, code, kind, data);
}
LRESULT CALLBACK InputController::keyHook(int code, WPARAM kind, LPARAM data) {
  auto self = instance;
  if (code >= 0 && self && self->window && reinterpret_cast<KBDLLHOOKSTRUCT *>(data)->dwExtraInfo != INPUT_TAG) {
    const auto event = reinterpret_cast<KBDLLHOOKSTRUCT *>(data);
    if ((kind == WM_KEYDOWN || kind == WM_SYSKEYDOWN) && event->vkCode == VK_ESCAPE && (GetAsyncKeyState(VK_CONTROL) & 0x8000) && (GetAsyncKeyState(VK_MENU) & 0x8000)) {
      self->stop();
      Json value; text(value, L"event", "cancelled"); text(value, L"code", "computer_cancelled"); number(value, L"generation", self->generation);
      self->notify(value);
    } else {
      self->userActivityAt = GetTickCount64();
      if (self->active) self->pause("computer_user_takeover");
    }
  }
  return CallNextHookEx(nullptr, code, kind, data);
}
LRESULT CALLBACK InputController::rawWindow(HWND hwnd, UINT message, WPARAM w, LPARAM l) {
  auto self = instance;
  if (message == WM_INPUT && self && (self->active || self->arming)) {
    RAWINPUT input{}; UINT size = sizeof(input);
    if (GetRawInputData(reinterpret_cast<HRAWINPUT>(l), RID_INPUT, &input, &size, sizeof(RAWINPUTHEADER)) != UINT(-1) && input.header.hDevice) {
      // 只计数，用于区分实机验收中的人工移动；不保留坐标，也不触发暂停
      if (input.header.dwType == RIM_TYPEMOUSE && (input.data.mouse.lLastX || input.data.mouse.lLastY)) ++self->physicalMoves;
      const bool takeover = (input.header.dwType == RIM_TYPEMOUSE && input.data.mouse.usButtonFlags != 0) || input.header.dwType == RIM_TYPEKEYBOARD;
      if (takeover) {
        self->userActivityAt = GetTickCount64();
        if (self->active) self->pause("computer_user_takeover");
      }
    }
  } else if (message == WM_DISPLAYCHANGE && self) self->pause("computer_display_changed");
  return DefWindowProcW(hwnd, message, w, l);
}
void InputController::watch() {
  winrt::init_apartment(winrt::apartment_type::multi_threaded);
  WNDCLASSW cls{}; cls.lpfnWndProc = rawWindow; cls.hInstance = GetModuleHandleW(nullptr); cls.lpszClassName = L"DaedalusInputMonitor";
  RegisterClassW(&cls);
  HWND sink = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, cls.lpszClassName, L"", WS_POPUP, 0, 0, 0, 0, nullptr, nullptr, cls.hInstance, nullptr);
  RAWINPUTDEVICE devices[]{{1, 2, RIDEV_INPUTSINK, sink}, {1, 6, RIDEV_INPUTSINK, sink}};
  const bool rawReady = sink && RegisterRawInputDevices(devices, 2, sizeof(RAWINPUTDEVICE));
  HHOOK mouse = SetWindowsHookExW(WH_MOUSE_LL, mouseHook, GetModuleHandleW(nullptr), 0);
  HHOOK keyboard = SetWindowsHookExW(WH_KEYBOARD_LL, keyHook, GetModuleHandleW(nullptr), 0);
  ready = mouse && keyboard && rawReady;
  while (!quitting) {
    MSG msg;
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    if (active) {
      if (GetTickCount64() - heartbeatAt > 2000) pause("computer_heartbeat_timeout");
      else if (!IsWindow(window) || GetAncestor(GetForegroundWindow(), GA_ROOT) != window) pause("computer_focus_changed");
      HDESK desktop = OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS);
      if (!desktop) pause("computer_desktop_unavailable");
      else CloseDesktop(desktop);
    }
    MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
  }
  if (mouse) UnhookWindowsHookEx(mouse);
  if (keyboard) UnhookWindowsHookEx(keyboard);
  if (sink) DestroyWindow(sink);
}
Json InputController::start(HWND target, const Json &params) {
  unsigned startingGeneration;
  {
    std::lock_guard lock(inputMutex);
    active = false; arming = false; window = nullptr;
    startingGeneration = ++generation;
  }
  if (!ready) throw std::runtime_error("computer_input_monitor_unavailable");
  const auto overlays = params.GetNamedArray(L"overlays");
  if (overlays.Size() != 2) throw std::runtime_error("computer_overlay_unavailable");
  for (auto item : overlays) {
    HWND overlay = reinterpret_cast<HWND>(std::stoull(utf8(item.GetString())));
    DWORD pid = 0, affinity = 0;
    GetWindowThreadProcessId(overlay, &pid);
    if (pid != parent || !GetWindowDisplayAffinity(overlay, &affinity) || affinity != WDA_EXCLUDEFROMCAPTURE)
      throw std::runtime_error("computer_capture_exclusion_failed");
  }
  auto next = static_cast<unsigned>(params.GetNamedNumber(L"generation"));
  if (next == 0) throw std::runtime_error("computer_invalid_request");
  {
    std::lock_guard lock(inputMutex);
    if (generation != startingGeneration) throw std::runtime_error("computer_cancelled");
    window = target; generation = next; arming = true;
  }
  // 跨线程激活可能异步完成；批准按钮的鼠标/按键释放不能算作接管
  if (GetAncestor(GetForegroundWindow(), GA_ROOT) != target) SetForegroundWindow(target);
  ControlActivationGate gate(GetTickCount64());
  for (;;) {
    bool released = GetTickCount64() - userActivityAt >= 100;
    for (int key = 1; released && key < 256; ++key)
      if (GetAsyncKeyState(key) & 0x8000) released = false;
    const auto status = gate.sample(GetTickCount64(), arming && generation == next && window == target && IsWindow(target),
      GetAncestor(GetForegroundWindow(), GA_ROOT) == target, released);
    if (status == ActivationStatus::Waiting) {
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
      continue;
    }
    std::lock_guard lock(inputMutex);
    if (status == ActivationStatus::Ready && arming && generation == next && window == target &&
        GetAncestor(GetForegroundWindow(), GA_ROOT) == target) {
      heartbeat(); arming = false; active = true;
      Json result; jsonBoolean(result, L"active", true); return result;
    }
    // stop/pause 可以在工作线程等待时立即使代次失效，不能在这里重新启用
    if (generation == next) arming = false;
    Json result; jsonBoolean(result, L"active", false);
    text(result, L"code", status == ActivationStatus::Cancelled ? "computer_paused" :
      status == ActivationStatus::UserBusy ? "computer_user_takeover" : "computer_activation_required");
    return result;
  }
}
void InputController::validate(HWND target, const Json &frame, const POINT *point, bool passwordCheck) {
  if (target != window || !IsWindowVisible(target) || IsIconic(target) || GetAncestor(GetForegroundWindow(), GA_ROOT) != target)
    throw std::runtime_error("computer_focus_changed");
  RECT rect{};
  if (FAILED(DwmGetWindowAttribute(target, DWMWA_EXTENDED_FRAME_BOUNDS, &rect, sizeof(rect))))
    throw std::runtime_error("computer_observation_stale");
  const auto bounds = frame.GetNamedObject(L"screenBounds");
  if (rect.left != bounds.GetNamedNumber(L"x") || rect.top != bounds.GetNamedNumber(L"y") ||
      rect.right - rect.left != bounds.GetNamedNumber(L"width") || rect.bottom - rect.top != bounds.GetNamedNumber(L"height") ||
      GetDpiForWindow(target) != frame.GetNamedNumber(L"dpi"))
    throw std::runtime_error("computer_observation_stale");
  DWORD thread = GetWindowThreadProcessId(target, nullptr);
  GUITHREADINFO gui{sizeof(GUITHREADINFO)};
  if (!GetGUIThreadInfo(thread, &gui) || gui.flags & (GUI_INMENUMODE | GUI_SYSTEMMENUMODE | GUI_POPUPMENUMODE) ||
      !gui.hwndFocus || GetAncestor(gui.hwndFocus, GA_ROOT) != target)
    throw std::runtime_error("computer_focus_changed");
  if (point && (!PtInRect(&rect, *point) || GetAncestor(WindowFromPoint(*point), GA_ROOT) != target))
    throw std::runtime_error("computer_target_occluded");
  // 焦点/命中控件必须能确认不是密码字段；UIA 不可用时拒绝输入
  if (passwordCheck) {
  winrt::com_ptr<IUIAutomation> automation;
  winrt::check_hresult(CoCreateInstance(CLSID_CUIAutomation8, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(automation.put())));
  auto timeout = automation.try_as<IUIAutomation2>();
  if (timeout) { timeout->put_ConnectionTimeout(500); timeout->put_TransactionTimeout(500); }
  winrt::com_ptr<IUIAutomationElement> element;
  winrt::check_hresult(point ? automation->ElementFromPoint(*point, element.put()) : automation->GetFocusedElement(element.put()));
  BOOL password = TRUE;
  if (!element || FAILED(element->get_CurrentIsPassword(&password)) || password)
    throw std::runtime_error("computer_password_protected");
  }
  for (int key : {VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN})
    if (GetAsyncKeyState(key) & 0x8000) throw std::runtime_error("computer_user_takeover");
}
void InputController::injected(const std::vector<INPUT> &events, unsigned expected) {
  std::lock_guard lock(inputMutex);
  if (!active || generation != expected) throw std::runtime_error("computer_paused");
  const auto sent = SendInput(static_cast<UINT>(events.size()), const_cast<INPUT *>(events.data()), sizeof(INPUT));
  if (sent != events.size()) {
    // 仅释放本次事件里的按下键，不重置用户其他键
    for (UINT i = 0; i < sent; ++i) {
      INPUT up = events[i];
      if (up.type == INPUT_KEYBOARD && !(up.ki.dwFlags & KEYEVENTF_KEYUP)) { up.ki.dwFlags |= KEYEVENTF_KEYUP; SendInput(1, &up, sizeof(INPUT)); }
    }
    active = false;
    throw std::runtime_error("computer_action_unknown");
  }
}
void InputController::progress(const Json &params, POINT point, const char *phase) {
  Json event; text(event, L"event", "progress"); text(event, L"phase", phase);
  text(event, L"code", "computer_progress");
  event.SetNamedValue(L"actionId", params.GetNamedValue(L"actionId"));
  event.SetNamedValue(L"generation", params.GetNamedValue(L"generation"));
  number(event, L"x", point.x); number(event, L"y", point.y); notify(event);
}
Json InputController::action(HWND target, const Json &frame, const Json &params,
    const std::function<void(const Json &, const std::function<void(POINT)> &)> &uia) {
  const auto expected = static_cast<unsigned>(params.GetNamedNumber(L"generation"));
  if (!active || expected != generation) throw std::runtime_error("computer_paused");
  if (params.GetNamedString(L"observationId") != frame.GetNamedString(L"observationId")) throw std::runtime_error("computer_observation_stale");
  const auto action = params.GetNamedObject(L"action");
  const auto kind = action.GetNamedString(L"type");
  std::vector<INPUT> inputs;
  auto keyboard = [&](WORD key, DWORD flags) { INPUT e{}; e.type = INPUT_KEYBOARD; e.ki.wVk = key; e.ki.dwFlags = flags; e.ki.dwExtraInfo = INPUT_TAG; return e; };
  // 产品输入只开放 UIA 与受限键盘；坐标点击/滚动不建立触摸设备，也不回退鼠标
  if (kind == L"click" || kind == L"scroll") throw std::runtime_error("computer_action_not_supported");
  const bool semantic = std::wstring(kind).starts_with(L"uia_");
  if (!semantic) validate(target, frame, nullptr);
  if (semantic) {
    if (!uia) throw std::runtime_error("computer_uia_unsupported");
    uia(action, [&](POINT point) {
      validate(target, frame, &point);
      if (!active || generation != expected) throw std::runtime_error("computer_paused");
      progress(params, point, "semantic");
    });
    if (!active || generation != expected) throw std::runtime_error("computer_action_unknown");
  } else if (kind == L"key") {
    static const std::map<std::wstring, int> keys{{L"Enter", VK_RETURN},{L"Tab",VK_TAB},{L"Escape",VK_ESCAPE},{L"Backspace",VK_BACK},{L"Delete",VK_DELETE},{L"ArrowLeft",VK_LEFT},{L"ArrowRight",VK_RIGHT},{L"ArrowUp",VK_UP},{L"ArrowDown",VK_DOWN},{L"Home",VK_HOME},{L"End",VK_END},{L"PageUp",VK_PRIOR},{L"PageDown",VK_NEXT}};
    std::wstring key(action.GetNamedString(L"key")); WORD modifier = 0, code = 0;
    if (key == L"Shift+Tab") { modifier = VK_SHIFT; code = VK_TAB; }
    else if (key.size() == 6 && key.starts_with(L"Ctrl+") && std::wstring(L"AFSZY").find(key[5]) != std::wstring::npos) { modifier = VK_CONTROL; code = key[5]; }
    else if (keys.contains(key)) code = static_cast<WORD>(keys.at(key));
    if (!code || action.Size() != 2) throw std::runtime_error("computer_invalid_request");
    if (modifier) inputs.push_back(keyboard(modifier, 0));
    const DWORD extended = code == VK_DELETE || (code >= VK_PRIOR && code <= VK_DOWN) ? KEYEVENTF_EXTENDEDKEY : 0;
    inputs.push_back(keyboard(code, extended)); inputs.push_back(keyboard(code, extended | KEYEVENTF_KEYUP));
    if (modifier) inputs.push_back(keyboard(modifier, KEYEVENTF_KEYUP));
  } else if (kind == L"text") {
    auto text = action.GetNamedString(L"text");
    if (text.empty() || text.size() > 4096 || action.Size() != 2) throw std::runtime_error("computer_invalid_request");
    bool dispatched = false;
    try {
      for (wchar_t ch : text) {
        validate(target, frame, nullptr);
        INPUT down = keyboard(0, KEYEVENTF_UNICODE); down.ki.wScan = ch;
        INPUT up = down; up.ki.dwFlags |= KEYEVENTF_KEYUP;
        injected({down, up}, expected);
        dispatched = true;
      }
    } catch (...) {
      if (dispatched) throw std::runtime_error("computer_action_unknown");
      throw;
    }
  } else throw std::runtime_error("computer_invalid_request");
  if (!inputs.empty()) { validate(target, frame, nullptr); injected(inputs, expected); }
  if (!active || generation != expected) throw std::runtime_error("computer_action_unknown");
  Json result;
  text(result, L"actionId", utf8(params.GetNamedString(L"actionId")));
  text(result, L"observationId", utf8(params.GetNamedString(L"observationId")));
  text(result, L"status", "dispatched"); text(result, L"dispatchedAt", nowIso()); number(result, L"generation", expected);
  text(result, L"transport", semantic ? "uia" : "keyboard");
  return result;
}
