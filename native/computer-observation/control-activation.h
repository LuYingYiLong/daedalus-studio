#pragma once
#include <cstdint>

enum class ActivationStatus { Waiting, Ready, FocusRequired, UserBusy, Cancelled };

// 只在用户明确启动/继续后等待一次；不循环抢焦点，不在等待期间启用输入
class ControlActivationGate {
public:
  explicit ControlActivationGate(uint64_t started) : started(started) {}
  ActivationStatus sample(uint64_t now, bool current, bool foreground, bool released) {
    if (!current) return ActivationStatus::Cancelled;
    if (seenForeground && !foreground) return ActivationStatus::FocusRequired;
    seenForeground = seenForeground || foreground;
    if (foreground && released) {
      if (!stable) { stable = true; stableSince = now; }
      if (now - stableSince >= 100) return ActivationStatus::Ready;
    } else stable = false;
    if (now - started >= 1500)
      return foreground ? ActivationStatus::UserBusy : ActivationStatus::FocusRequired;
    return ActivationStatus::Waiting;
  }
private:
  uint64_t started, stableSince = 0;
  bool stable = false, seenForeground = false;
};
