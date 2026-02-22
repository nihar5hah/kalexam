"use client";

import React from "react";
import { cn } from "@/lib/utils";

type AnimatedGlowingBorderProps = {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
};

export const AnimatedGlowingBorder = ({
  children,
  className,
  innerClassName,
}: AnimatedGlowingBorderProps) => {
  return (
    <div className={cn("relative isolate group w-full overflow-visible", className)}>
      <div className="pointer-events-none absolute -inset-[4px] z-0 rounded-[16px]
                        bg-[linear-gradient(90deg,rgba(249,115,22,0.55)_0%,rgba(245,158,11,0.45)_50%,rgba(249,115,22,0.55)_100%)]
                        blur-[9px] opacity-40 transition-opacity duration-300 group-hover:opacity-85 group-focus-within:opacity-85" />
      <div className="pointer-events-none absolute left-1/2 -bottom-[7px] z-0 h-[18px] w-[84%] -translate-x-1/2 rounded-full
                        bg-[linear-gradient(90deg,rgba(249,115,22,0.45)_0%,rgba(245,158,11,0.35)_50%,rgba(249,115,22,0.45)_100%)]
                        blur-[10px] opacity-40 transition-opacity duration-300 group-hover:opacity-85 group-focus-within:opacity-85" />
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl blur-[2.5px]
                        before:absolute before:content-[''] before:z-0 before:w-[190%] before:h-[190%] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[72deg]
                        before:bg-[conic-gradient(rgba(0,0,0,0)_0%,rgba(249,115,22,0.95)_14%,rgba(0,0,0,0)_36%,rgba(0,0,0,0)_58%,rgba(245,158,11,0.95)_76%,rgba(0,0,0,0)_100%)]
                        opacity-50 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100
                        before:transition-all before:duration-2000 group-hover:before:rotate-[-108deg] group-focus-within:before:rotate-[432deg] group-focus-within:before:duration-[4000ms]"/>

      <div className={cn("relative z-10 w-full rounded-lg bg-[#010201] ring-1 ring-white/10", innerClassName)}>
        {children}
      </div>
    </div>
  );
};

const SearchComponent = () => {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute z-[-1] w-full h-min-screen"></div>
      <AnimatedGlowingBorder className="w-[314px] h-[62px]" innerClassName="h-full">
        <input
          placeholder="Search..."
          type="text"
          name="text"
          className="bg-[#010201] border-none w-[301px] h-[56px] rounded-lg text-white px-[59px] text-lg focus:outline-none placeholder-gray-400"
        />
        <div id="input-mask" className="pointer-events-none w-[100px] h-[20px] absolute bg-gradient-to-r from-transparent to-black top-[18px] left-[70px] group-focus-within:hidden"></div>
        <div id="pink-mask" className="pointer-events-none w-[30px] h-[20px] absolute bg-[#f97316] top-[10px] left-[5px] blur-2xl opacity-70 transition-all duration-2000 group-hover:opacity-0"></div>
        <div className="absolute h-[42px] w-[40px] overflow-hidden top-[7px] right-[7px] rounded-lg
                        before:absolute before:content-[''] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-90
                        before:bg-[conic-gradient(rgba(0,0,0,0),#3d2a0e,rgba(0,0,0,0)_50%,rgba(0,0,0,0)_50%,#3d2a0e,rgba(0,0,0,0)_100%)]
                        before:brightness-135 before:animate-spin-slow" />
        <div id="filter-icon" className="absolute top-2 right-2 flex items-center justify-center z-[2] max-h-10 max-w-[38px] h-full w-full [isolation:isolate] overflow-hidden rounded-lg bg-gradient-to-b from-[#1a1208] via-black to-[#120d00] border border-transparent">
          <svg preserveAspectRatio="none" height="27" width="27" viewBox="4.8 4.56 14.832 15.408" fill="none">
            <path d="M8.16 6.65002H15.83C16.47 6.65002 16.99 7.17002 16.99 7.81002V9.09002C16.99 9.56002 16.7 10.14 16.41 10.43L13.91 12.64C13.56 12.93 13.33 13.51 13.33 13.98V16.48C13.33 16.83 13.1 17.29 12.81 17.47L12 17.98C11.24 18.45 10.2 17.92 10.2 16.99V13.91C10.2 13.5 9.97 12.98 9.73 12.69L7.52 10.36C7.23 10.08 7 9.55002 7 9.20002V7.87002C7 7.17002 7.52 6.65002 8.16 6.65002Z" stroke="#d6d6e6" strokeWidth="1" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </div>
        <div id="search-icon" className="absolute left-5 top-[15px]">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" height="24" fill="none" className="feather feather-search">
            <circle stroke="url(#search)" r="8" cy="11" cx="11"></circle>
            <line stroke="url(#searchl)" y2="16.65" y1="22" x2="16.65" x1="22"></line>
            <defs>
              <linearGradient gradientTransform="rotate(50)" id="search">
                <stop stopColor="#f8e7f8" offset="0%"></stop>
                <stop stopColor="#b6a9b7" offset="50%"></stop>
              </linearGradient>
              <linearGradient id="searchl">
                <stop stopColor="#b6a9b7" offset="0%"></stop>
                <stop stopColor="#837484" offset="50%"></stop>
              </linearGradient>
            </defs>
          </svg>
        </div>
      </AnimatedGlowingBorder>
    </div>
  );
};

export default SearchComponent;
