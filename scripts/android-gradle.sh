#!/usr/bin/env bash
# Run Gradle inside android/ with the project-local JDK and SDK when present.
#
# The toolchain lives in .android/jdk and .android/sdk (gitignored) so it does
# not clutter the home directory. On another machine, set JAVA_HOME and
# ANDROID_HOME yourself or place a toolchain in the same folders.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
jdk="$root/.android/jdk"
sdk="$root/.android/sdk"

if [ -d "$jdk" ]; then
  export JAVA_HOME="$jdk"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -d "$sdk" ]; then
  export ANDROID_HOME="$sdk"
  export ANDROID_SDK_ROOT="$sdk"
fi

cd "$root/android"
exec ./gradlew "$@"
