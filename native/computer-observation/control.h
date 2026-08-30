#pragma once
#include "perception.h"
#include <atomic>
#include <functional>
#include <mutex>
#include <thread>

// 输入线程不接触 OCR/UIA；人工接管与紧急停止不会排在感知队列之后
class InputController {
public:
  explicit InputController(DWORD parent, std::function<void(const Json &)> notify);
  ~InputController();
  Json start(HWND target, const Json &params);
  void pause(const std::string &code);
  void stop();
  void heartbeat();
  Json action(HWND target, const Json &frame, const Json &params);
private:
  static LRESULT CALLBACK mouseHook(int, WPARAM, LPARAM);
  static LRESULT CALLBACK keyHook(int, WPARAM, LPARAM);
  static InputController *instance;
  void watch();
  void injected(const std::vector<INPUT> &events, unsigned generation);
  void validate(HWND target, const Json &frame, const POINT *point);
  DWORD parent;
  std::function<void(const Json &)> notify;
  std::atomic<bool> active{false}, arming{false}, quitting{false}, ready{false};
  std::atomic<unsigned> generation{0};
  std::atomic<ULONGLONG> heartbeatAt{0};
  std::atomic<HWND> window{nullptr};
  std::mutex inputMutex;
  POINT anchor{};
  std::thread watcher;
};
