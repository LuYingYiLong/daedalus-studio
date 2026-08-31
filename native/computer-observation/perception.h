#pragma once
#include <chrono>
#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/base.h>

using Json = winrt::Windows::Data::Json::JsonObject;
using Array = winrt::Windows::Data::Json::JsonArray;
using Value = winrt::Windows::Data::Json::JsonValue;
struct Pixels {
  int width = 0, height = 0;
  std::vector<unsigned char> bgra;
};
struct Target {
  HWND hwnd = nullptr;
  DWORD pid = 0;
  ULONGLONG processStart = 0;
  std::string id;
  std::wstring title;
};
std::string uuid();
std::string nowIso();
Json rectJson(double x, double y, double w, double h);
void text(Json &j, const wchar_t *key, const std::string &value);
void number(Json &j, const wchar_t *key, double value);
void jsonBoolean(Json &j, const wchar_t *key, bool value);
std::string utf8(const winrt::hstring &s);
std::string pngDataUrl(const Pixels &pixels);
Pixels resizePixels(const Pixels &input, int w, int h);
std::vector<float> normalizedPixels(const Pixels &input, int w, int h);
void testUiaFixture(bool testCapture = false);
void testUiaActions(HWND target, HWND edit, HWND password, HWND checkbox);
class Ocr {
public:
  explicit Ocr(const std::wstring &directory);
  ~Ocr();
  Array recognize(const Pixels &, bool &truncated);

private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};
class Perception {
public:
  explicit Perception(DWORD excludedPid, const std::wstring &directory);
  Json list();
  Json select(const std::string &id);
  Json observe();
  void release();
  void invalidateNodes() { ++nodeEpoch; }
  void performUia(const std::string &observationId, const Json &action, const std::function<void(POINT)> &validate);
  bool targetValid();
  HWND controlTarget() { if (!targetValid()) throw std::runtime_error("computer_window_unavailable"); return selected->hwnd; }

private:
  friend void testUiaActions(HWND target, HWND edit, HWND password, HWND checkbox);
  DWORD excludedPid;
  std::wstring directory;
  std::vector<Target> targets;
  std::unique_ptr<Target> selected;
  std::unique_ptr<Ocr> ocr;
  struct UiaCache;
  std::shared_ptr<UiaCache> uiaCache;
  std::atomic<unsigned> nodeEpoch{0};
  // 捕获项的 Closed 事件会使已授权窗口失效，包括句柄复用
  struct WindowLife;
  std::shared_ptr<WindowLife> life;
  std::unordered_map<std::string, std::shared_ptr<WindowLife>> registered;
};
