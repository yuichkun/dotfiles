#!/bin/bash
#for i in `seq 0 40`;
#do
#	clear
#	cat ~/loginAnsis/$i.ansi 
#	sleep 0.1
#done	
echo '\n'
cal | grep --color -EC6 "\b$(date +%e | sed "s/ //g")"
figlet YOGO BOOTED
