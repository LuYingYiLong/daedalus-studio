#include "perception.h"
#include "control.h"
#include <condition_variable>
#include <deque>
#include <mutex>
#include <fcntl.h>
#include <filesystem>
#include <io.h>
#include <iostream>
#include <thread>

void testControlFixture();
static constexpr uint32_t MAX_FRAME = 8 * 1024 * 1024;
static std::mutex replyMutex;
static void reply(const Json &value) {
  std::lock_guard lock(replyMutex);
  const auto bytes = utf8(value.Stringify());
  if (bytes.size() > MAX_FRAME)
    throw std::runtime_error("computer_result_too_large");
  uint32_t size = static_cast<uint32_t>(bytes.size());
  std::cout.write(reinterpret_cast<const char *>(&size), 4);
  std::cout.write(bytes.data(), size);
  std::cout.flush();
}
static void exact(const Json &obj,
                  std::initializer_list<const wchar_t *> names) {
  if (obj.Size() != names.size())
    throw std::runtime_error("computer_invalid_request");
  for (auto key : names)
    if (!obj.HasKey(key))
      throw std::runtime_error("computer_invalid_request");
}
int wmain(int argc, wchar_t **argv) {
  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 |
                             LOAD_LIBRARY_SEARCH_APPLICATION_DIR);
    if (argc == 2 && std::wstring(argv[1]) == L"--test-input") {
      testControlFixture();
      std::cout << "dedicated input, password exclusion and takeover fixture passed\n";
      return 0;
    }
    if (argc == 2 && std::wstring(argv[1]) == L"--test-capture") {
      testUiaFixture(true);
      std::cout << "dedicated WGC/UIA fixture passed\n";
      return 0;
    }
    if (argc == 2 && std::wstring(argv[1]) == L"--test-uia") {
      testUiaFixture();
      std::cout << "dedicated UIA fixture and password redaction passed\n";
      return 0;
    }
    if (argc == 3 && std::wstring(argv[1]) == L"--test-ocr") {
      // 仅生成内存测试图片，不读取用户窗口
      HDC dc = CreateCompatibleDC(nullptr);
      BITMAPINFO info{};
      info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
      info.bmiHeader.biWidth = 800;
      info.bmiHeader.biHeight = -180;
      info.bmiHeader.biPlanes = 1;
      info.bmiHeader.biBitCount = 32;
      info.bmiHeader.biCompression = BI_RGB;
      void *data = nullptr;
      HBITMAP bitmap =
          CreateDIBSection(dc, &info, DIB_RGB_COLORS, &data, nullptr, 0);
      auto oldBitmap = SelectObject(dc, bitmap);
      RECT area{0, 0, 800, 180};
      FillRect(dc, &area,
               reinterpret_cast<HBRUSH>(GetStockObject(WHITE_BRUSH)));
      SetBkMode(dc, TRANSPARENT);
      SetTextColor(dc, RGB(0, 0, 0));
      HFONT font =
          CreateFontW(-38, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                      DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                      ANTIALIASED_QUALITY, DEFAULT_PITCH, L"Microsoft YaHei");
      auto oldFont = SelectObject(dc, font);
      const std::wstring english = L"Daedalus Windows OCR 12345",
                         chinese = L"本地窗口文字识别测试";
      TextOutW(dc, 24, 20, english.c_str(), static_cast<int>(english.size()));
      TextOutW(dc, 24, 88, chinese.c_str(), static_cast<int>(chinese.size()));
      GdiFlush();
      Pixels pixels{800, 180, std::vector<unsigned char>(800 * 180 * 4)};
      memcpy(pixels.bgra.data(), data, pixels.bgra.size());
      for (size_t i = 3; i < pixels.bgra.size(); i += 4)
        pixels.bgra[i] = 255;
      SelectObject(dc, oldFont);
      SelectObject(dc, oldBitmap);
      DeleteObject(font);
      DeleteObject(bitmap);
      DeleteDC(dc);
      Ocr ocr(argv[2]);
      bool truncated = false;
      auto blocks = ocr.recognize(pixels, truncated);
      std::string joined;
      for (auto block : blocks)
        joined += utf8(block.GetObject().GetNamedString(L"text"));
      if (truncated || joined.find("Daedalus") == std::string::npos ||
          joined.find("12345") == std::string::npos ||
          joined.find("窗口") == std::string::npos) {
        std::cerr << "computer_ocr_fixture_failed: " << joined << "\n";
        return 1;
      }
      std::cout << "offline English/Chinese OCR fixture passed\n";
      return 0;
    }
    if (argc == 2 && std::wstring(argv[1]) == L"--self-test") {
      Pixels p{2, 1, {0, 0, 255, 255, 255, 0, 0, 255}};
      const auto scaled = resizePixels(p, 1, 1);
      if (scaled.width != 1 || scaled.bgra.size() != 4 ||
          pngDataUrl(p).find("data:image/png;base64,") != 0)
        return 1;
      Json j = rectJson(-100, 20, 300, 400);
      if (j.GetNamedNumber(L"x") != -100)
        return 1;
      std::cout << "computer helper self-test passed\n";
      return 0;
    }
    if (argc != 5 || std::wstring(argv[1]) != L"--parent" ||
        std::wstring(argv[3]) != L"--resources")
      return 2;
    DWORD parent = std::stoul(argv[2]);
    HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, parent);
    if (!process)
      return 2;
    std::thread([process] {
      WaitForSingleObject(process, INFINITE);
      CloseHandle(process);
      ExitProcess(0);
    }).detach();
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    Perception perception(parent, argv[4]);
    InputController control(parent, [](const Json &state) {
      Json event; number(event, L"version", 2); text(event, L"event", "control");
      event.SetNamedValue(L"state", state); reply(event);
    });
    Json lastFrame;
    HWND lastFocus = nullptr;
    std::mutex queueMutex;
    std::condition_variable condition;
    std::deque<std::string> queue;
    bool closed = false;
    auto execute = [&](const std::string &input) {
      Json response;
      text(response, L"id", "invalid");
      number(response, L"version", 2);
      try {
        Json request = Json::Parse(winrt::to_hstring(input));
        exact(request, {L"version", L"id", L"method", L"params"});
        const auto id = request.GetNamedString(L"id");
        if (id.empty() || id.size() > 160 ||
            request.GetNamedNumber(L"version") != 2)
          throw std::runtime_error("computer_protocol_mismatch");
        response.SetNamedValue(L"id", Value::CreateStringValue(id));
        const auto method = request.GetNamedString(L"method");
        const auto params = request.GetNamedObject(L"params");
        Json result;
        if (method == L"control.stop" || method == L"control.pause" || method == L"control.heartbeat") {
          exact(params, {});
          if (method == L"control.heartbeat") control.heartbeat();
          else if (method == L"control.pause") control.pause("computer_paused");
          else control.stop();
        } else if (method == L"control.start") {
          exact(params, {L"overlays", L"generation"});
          lastFrame = Json{};
          result = control.start(perception.controlTarget(), params);
        } else if (method == L"action") {
          exact(params, {L"observationId", L"actionId", L"action", L"generation"});
          auto frame = lastFrame; lastFrame = Json{};
          if (!frame.HasKey(L"observationId")) throw std::runtime_error("computer_observation_stale");
          HWND target = perception.controlTarget();
          const auto kind = params.GetNamedObject(L"action").GetNamedString(L"type");
          if (kind == L"text" || kind == L"key") {
            GUITHREADINFO gui{sizeof(GUITHREADINFO)};
            if (!lastFocus || !GetGUIThreadInfo(GetWindowThreadProcessId(target, nullptr), &gui) || gui.hwndFocus != lastFocus)
              throw std::runtime_error("computer_observation_stale");
          }
          result = control.action(target, frame, params);
        } else if (method == L"select") {
          control.stop(); lastFrame = Json{};
          exact(params, {L"sourceId"});
          result = perception.select(utf8(params.GetNamedString(L"sourceId")));
        } else {
          exact(params, {});
          if (method == L"hello") {
            number(result, L"version", 2);
            jsonBoolean(result, L"computerControl", true);
          } else if (method == L"target") {
            auto hwnd = perception.controlTarget(); RECT r{};
            if (!GetWindowRect(hwnd, &r)) throw std::runtime_error("computer_window_unavailable");
            result.SetNamedValue(L"screenBounds", rectJson(r.left, r.top, r.right-r.left, r.bottom-r.top));
          } else if (method == L"list")
            result = perception.list();
          else if (method == L"observe") {
            result = perception.observe(); lastFrame = result;
            GUITHREADINFO gui{sizeof(GUITHREADINFO)};
            lastFocus = GetGUIThreadInfo(GetWindowThreadProcessId(perception.controlTarget(), nullptr), &gui) ? gui.hwndFocus : nullptr;
          }
          else if (method == L"validate")
            jsonBoolean(result, L"valid", perception.targetValid());
          else if (method == L"release") { control.stop(); lastFrame = Json{}; perception.release(); }
          else
            throw std::runtime_error("computer_method_not_allowed");
        }
        jsonBoolean(response, L"ok", true);
        response.SetNamedValue(L"result", result);
      } catch (const std::exception &e) {
        jsonBoolean(response, L"ok", false);
        std::string code = e.what();
        text(response, L"error",
             code.starts_with("computer_") && code.size() < 100
                 ? code
                 : "computer_native_failed");
      } catch (...) {
        jsonBoolean(response, L"ok", false);
        text(response, L"error", "computer_native_failed");
      }
      reply(response);
    };
    std::thread worker([&] {
      winrt::init_apartment(winrt::apartment_type::multi_threaded);
      for (;;) {
        std::string input;
        {
          std::unique_lock lock(queueMutex);
          condition.wait(lock, [&] { return closed || !queue.empty(); });
          if (closed) return;
          input = std::move(queue.front()); queue.pop_front();
        }
        execute(input);
      }
    });
    for (;;) {
      uint32_t size = 0;
      if (!std::cin.read(reinterpret_cast<char *>(&size), 4)) break;
      if (!size || size > 16384) { control.stop(); ExitProcess(3); }
      std::string input(size, '\0');
      if (!std::cin.read(input.data(), size)) break;
      try {
        const auto request = Json::Parse(winrt::to_hstring(input));
        const auto method = request.GetNamedString(L"method");
        if (method == L"control.stop" || method == L"control.pause" || method == L"control.heartbeat") { execute(input); continue; }
      } catch (...) { control.stop(); ExitProcess(3); }
      {
        std::lock_guard lock(queueMutex);
        if (queue.size() >= 2) { control.stop(); ExitProcess(3); }
        queue.push_back(std::move(input));
      }
      condition.notify_one();
    }
    control.stop();
    { std::lock_guard lock(queueMutex); closed = true; }
    condition.notify_one();
    worker.join();
    return 0;
  } catch (const winrt::hresult_error &error) {
    // 自检仅输出数值错误码，不输出可能包含本机内容的 Windows 异常文本
    if (argc >= 2 && std::wstring(argv[1]).starts_with(L"--test-"))
      std::cerr << "computer_fixture_hresult: 0x" << std::hex
                << static_cast<uint32_t>(error.code().value) << "\n";
    else
      std::cerr << "computer_helper_start_failed\n";
    return 1;
  } catch (const std::exception &error) {
    const std::string code = error.what();
    std::cerr << (code.starts_with("computer_") &&
                          code.find_first_not_of(
                              "abcdefghijklmnopqrstuvwxyz_") ==
                              std::string::npos
                      ? code
                      : "computer_helper_start_failed")
              << "\n";
    return 1;
  } catch (...) {
    std::cerr << "computer_helper_start_failed\n";
    return 1;
  }
}
