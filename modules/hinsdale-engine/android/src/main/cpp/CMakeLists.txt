cmake_minimum_required(VERSION 3.22.1)
project(hinsdale_engine_bridge)

add_library(hinsdale_engine SHARED IMPORTED)
set_target_properties(hinsdale_engine PROPERTIES IMPORTED_LOCATION "${CMAKE_CURRENT_LIST_DIR}/../jniLibs/${ANDROID_ABI}/libhinsdale_engine.so")
add_library(hinsdale_bridge SHARED hinsdale_engine_bridge.cpp)
find_library(log-lib log)
target_link_libraries(hinsdale_bridge hinsdale_engine ${log-lib})
