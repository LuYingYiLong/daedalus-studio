#include "control.h"
#include <dwmapi.h>
#include <future>
#include <chrono>
#include <iostream>
#include <commctrl.h>

static LRESULT CALLBACK fixtureProc(HWND hwnd, UINT message, WPARAM w, LPARAM l) {
  if (message == WM_COMMAND && LOWORD(w) == 101) { SetWindowTextW(hwnd, L"UIA invoke completed"); return 0; }
  if (message == WM_APP) { SetFocus(GetDlgItem(hwnd, static_cast<int>(w))); return 0; }
  return DefWindowProcW(hwnd, message, w, l);
}

// 只创建自己的测试窗口，不枚举、读取或操作任何用户应用
void testControlFixture() {
  INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_TREEVIEW_CLASSES}; InitCommonControlsEx(&controls);
  WNDCLASSW cls{}; cls.lpfnWndProc = fixtureProc; cls.hInstance = GetModuleHandleW(nullptr); cls.lpszClassName = L"DaedalusUiaInputFixture";
  RegisterClassW(&cls);
  HWND target = CreateWindowExW(0, cls.lpszClassName, L"Daedalus UIA/keyboard test fixture",
      WS_OVERLAPPEDWINDOW | WS_VISIBLE, 160, 160, 720, 520, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
  if (!target) throw std::runtime_error("computer_fixture_window_failed");
  HWND edit = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_AUTOHSCROLL, 20, 20, 400, 40, target, reinterpret_cast<HMENU>(100), GetModuleHandleW(nullptr), nullptr);
  HWND password = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | ES_PASSWORD, 20, 80, 400, 40, target, reinterpret_cast<HMENU>(102), GetModuleHandleW(nullptr), nullptr);
  HWND checkbox = CreateWindowExW(0, L"BUTTON", L"UIA toggle", WS_CHILD | WS_VISIBLE | BS_AUTOCHECKBOX, 450, 20, 160, 40, target, nullptr, GetModuleHandleW(nullptr), nullptr);
  CreateWindowExW(0, L"BUTTON", L"Invoke fixture", WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON, 450, 80, 160, 40, target, reinterpret_cast<HMENU>(101), cls.hInstance, nullptr);
  HWND list = CreateWindowExW(0, L"LISTBOX", L"", WS_CHILD | WS_VISIBLE | WS_VSCROLL | LBS_NOTIFY, 20, 160, 280, 180, target, reinterpret_cast<HMENU>(103), cls.hInstance, nullptr);
  for (int i = 0; i < 40; ++i) { auto name = L"Fixture item " + std::to_wstring(i); SendMessageW(list, LB_ADDSTRING, 0, reinterpret_cast<LPARAM>(name.c_str())); }
  HWND tree = CreateWindowExW(0, WC_TREEVIEWW, L"", WS_CHILD | WS_VISIBLE | TVS_HASBUTTONS | TVS_HASLINES | TVS_LINESATROOT, 340, 160, 280, 180, target, reinterpret_cast<HMENU>(104), cls.hInstance, nullptr);
  TVINSERTSTRUCTW item{}; item.hInsertAfter = TVI_ROOT; item.item.mask = TVIF_TEXT; item.item.pszText = const_cast<wchar_t *>(L"Fixture parent");
  HTREEITEM parentItem = TreeView_InsertItem(tree, &item);
  item.hParent = parentItem; item.hInsertAfter = TVI_LAST; item.item.pszText = const_cast<wchar_t *>(L"Fixture child"); TreeView_InsertItem(tree, &item);
  HWND overlays[2];
  for (auto &overlay : overlays) {
    overlay = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"STATIC", L"", WS_POPUP, 0, 0, 1, 1, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!SetWindowDisplayAffinity(overlay, WDA_EXCLUDEFROMCAPTURE)) throw std::runtime_error("computer_capture_exclusion_failed");
  }
  // windowsHide 的启动显示参数会覆盖 WS_VISIBLE，只显式显示本测试窗口
  ShowWindow(target, SW_SHOWNORMAL);
  if (!IsWindowVisible(target)) throw std::runtime_error("computer_fixture_window_hidden");
  SetForegroundWindow(target); SetFocus(edit);
  // 测试进程可能没有 Windows 前台激活权；只等待用户选择本窗口，不抢其他应用焦点
  if (GetAncestor(GetForegroundWindow(), GA_ROOT) != target) {
    SetWindowTextW(target, L"Daedalus input test - click this window to start (30s)");
    const auto deadline = GetTickCount64() + 30000;
    while (GetAncestor(GetForegroundWindow(), GA_ROOT) != target && GetTickCount64() < deadline) {
      MSG message;
      while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
      MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
    }
    if (GetAncestor(GetForegroundWindow(), GA_ROOT) != target) {
      DestroyWindow(target); for (auto overlay : overlays) DestroyWindow(overlay);
      throw std::runtime_error("computer_fixture_manual_activation_required");
    }
    SetFocus(edit);
  }
  auto future = std::async(std::launch::async, [=] {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    std::atomic<bool> paused{false};
    InputController input(GetCurrentProcessId(), [&](const Json &event) {
      if (event.GetNamedString(L"event") == L"paused") {
        paused = true;
        std::cerr << "input fixture pause: " << utf8(event.GetNamedString(L"code")) << "\n";
      }
    });
    std::jthread heartbeat([&](std::stop_token stop) {
      while (!stop.stop_requested()) { input.heartbeat(); std::this_thread::sleep_for(std::chrono::milliseconds(100)); }
    });
    Json start; Array handles;
    for (HWND overlay : overlays) handles.Append(winrt::Windows::Data::Json::JsonValue::CreateStringValue(std::to_wstring(reinterpret_cast<uintptr_t>(overlay))));
    start.SetNamedValue(L"overlays", handles); number(start, L"generation", 100);
    bool started = false;
    for (int attempt = 0; attempt < 100 && !started; ++attempt) {
      try {
        const auto result = input.start(target, start);
        started = result.GetNamedBoolean(L"active");
        if (!started) throw std::runtime_error(utf8(result.GetNamedString(L"code")));
      }
      catch (const std::runtime_error &e) { if (std::string(e.what()) != "computer_input_monitor_unavailable") throw; }
      if (!started) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    if (!started) throw std::runtime_error("computer_fixture_focus_failed");
    POINT cursorBefore{};
    if (!GetCursorPos(&cursorBefore)) throw std::runtime_error("computer_fixture_cursor_failed");
    const LONG cursorDelta = cursorBefore.x < GetSystemMetrics(SM_CXSCREEN) - 40 ? 32 : -32;
    if (!SetCursorPos(cursorBefore.x + cursorDelta, cursorBefore.y))
      throw std::runtime_error("computer_fixture_cursor_failed");
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    if (paused) throw std::runtime_error("computer_fixture_mouse_move_paused");
    SetCursorPos(cursorBefore.x, cursorBefore.y);
    auto frame = [&] {
      RECT r{}; winrt::check_hresult(DwmGetWindowAttribute(target, DWMWA_EXTENDED_FRAME_BOUNDS, &r, sizeof(r)));
      Json value; text(value, L"observationId", "fixture-frame");
      value.SetNamedValue(L"screenBounds", rectJson(r.left, r.top, r.right-r.left, r.bottom-r.top));
      number(value, L"width", r.right-r.left); number(value, L"height", r.bottom-r.top); number(value, L"dpi", GetDpiForWindow(target));
      return value;
    };
    int actionIndex = 0;
    auto execute = [&](const Json &action) {
      input.heartbeat();
      Json params; text(params, L"actionId", "fixture-action"); text(params, L"observationId", "fixture-frame");
      number(params, L"generation", 100); params.SetNamedValue(L"action", action);
      ++actionIndex;
      try { return input.action(target, frame(), params); }
      catch (const std::runtime_error &error) {
        if (std::string(error.what()) != "computer_focus_changed") {
          if (actionIndex < 6) std::cerr << "input fixture action " << actionIndex << ": " << error.what() << "\n";
          throw;
        }
        GUITHREADINFO gui{sizeof(GUITHREADINFO)};
        const bool found = GetGUIThreadInfo(GetWindowThreadProcessId(target, nullptr), &gui);
        std::cerr << "input fixture action " << actionIndex << ": foreground="
          << (GetAncestor(GetForegroundWindow(), GA_ROOT) == target) << ", gui=" << found
          << ", focusInside=" << (found && gui.hwndFocus && GetAncestor(gui.hwndFocus, GA_ROOT) == target)
          << ", flags=" << gui.flags << ", visible=" << IsWindowVisible(target) << ", iconic=" << IsIconic(target) << "\n";
        throw;
      }
    };
    // 触摸/坐标动作在执行器边界拒绝，不能创建接触或回退鼠标
    for (const char *kind : {"click", "scroll"}) {
      Json action; text(action, L"type", kind);
      bool rejected = false;
      try { execute(action); } catch (const std::runtime_error &e) { rejected = std::string(e.what()) == "computer_action_not_supported"; }
      if (!rejected) throw std::runtime_error("computer_fixture_coordinate_action_enabled");
    }
    const auto movesBefore = input.physicalMoves.load();
    GetCursorPos(&cursorBefore);
    testUiaActions(target, edit, password, checkbox);
    SendMessageW(target, WM_APP, 100, 0);
    Json typing; text(typing, L"type", "text"); text(typing, L"text", "Daedalus 测试");
    execute(typing);
    // SendInput 只确认派发，通过测试窗口读取结果确认应用确实收到
    wchar_t buffer[100]{};
    for (int attempt=0; attempt<100; ++attempt) {
      SendMessageW(edit, WM_GETTEXT, 100, reinterpret_cast<LPARAM>(buffer));
      if (std::wstring(buffer) == L"Daedalus 测试") break;
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    if (std::wstring(buffer) != L"Daedalus 测试") throw std::runtime_error("computer_fixture_text_failed");
    Json key; text(key, L"type", "key"); text(key, L"key", "ArrowLeft"); execute(key);
    SendMessageW(target, WM_APP, 102, 0);
    bool protectedPassword = false;
    try { execute(typing); } catch (const std::runtime_error &e) { protectedPassword = std::string(e.what()) == "computer_password_protected"; }
    SendMessageW(target, WM_APP, 100, 0);
    if (!protectedPassword) throw std::runtime_error("computer_fixture_password_failed");
    if (paused) throw std::runtime_error("computer_fixture_injection_misclassified");
    POINT after{}; GetCursorPos(&after);
    if (after.x != cursorBefore.x || after.y != cursorBefore.y) {
      if (input.physicalMoves != movesBefore) throw std::runtime_error("computer_fixture_user_moved_mouse_retry");
      throw std::runtime_error("computer_fixture_uia_keyboard_moved_mouse");
    }
    // 在本测试窗口中模拟用户按键，验证人工接管；不记录实际按键
    INPUT user[2]{}; user[0].type = user[1].type = INPUT_KEYBOARD; user[0].ki.wVk = user[1].ki.wVk = VK_RIGHT; user[1].ki.dwFlags = KEYEVENTF_KEYUP;
    if (GetAncestor(GetForegroundWindow(), GA_ROOT) != target) throw std::runtime_error("computer_fixture_focus_failed");
    SendInput(2, user, sizeof(INPUT));
    for (int i=0; i<100 && !paused; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    if (!paused) throw std::runtime_error("computer_fixture_takeover_failed");
    bool blocked=false;
    try { execute(key); } catch (...) { blocked=true; }
    if (!blocked) throw std::runtime_error("computer_fixture_pause_failed");
    input.stop();
  });
  while (future.wait_for(std::chrono::milliseconds(0)) != std::future_status::ready) {
    MSG message;
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
    MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
  }
  DestroyWindow(target);
  for (HWND overlay : overlays) DestroyWindow(overlay);
  future.get();
}
